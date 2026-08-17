/**
 * Session Routing — 钉钉 conversationId ↔ DSH SessionId 双向映射
 *
 * 关键决策：
 *   - 私聊：1 conversationId = 1 SessionId
 *   - 群聊：按 groupSessionScope 决定：
 *       'group'        → 全群共享一个 SessionId
 *       'group_sender' → 每个 senderStaffId 一个 SessionId
 *
 * 配置覆盖（优先级从高到低）：
 *   1. accounts[accountId].routes（账号级覆盖）
 *   2. 顶层 routes（全局）
 *   3. bindings[agentId].match.accountId（多机器人绑定）
 *   4. 默认 'main'
 *
 * 多账号：把 accountId 拼进 sessionId 命名空间，避免不同账号的群/私聊撞 session。
 *
 * SessionId 命名空间：`dingtalk:<accountId>:<scope>:<conversationId>[:s:<sender>]`
 */

import type { Context } from 'cordis'
import type {
  BridgeContext,
  DingtalkInboundMessage,
  SessionRouting,
} from '../types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-routing')

const SESSION_PREFIX = 'dingtalk:'

/**
 * PR-4 多账号：把 accountId 拼进 sessionId，避免不同账号的 conversationId 撞 session。
 */
function buildSessionId(args: {
  accountId: string
  isGroup: boolean
  conversationId: string
  scope: 'group' | 'group_sender'
  sender?: string
}): string {
  const kind = args.isGroup ? 'g' : 'd'
  const base = `${SESSION_PREFIX}${args.accountId}:${kind}:${args.conversationId}`
  if (args.isGroup && args.scope === 'group_sender' && args.sender) {
    return `${base}:s:${args.sender}`
  }
  return base
}

/**
 * 决定 agent scope. 优先级（高 → 低）：
 *   1. accounts[accountId].routes 中匹配 conversationId 的项
 *   2. 顶层 routes 中匹配 conversationId 的项
 *   3. bindings 反查：accountId 对应的 agentId 列表里的第一个
 *   4. 'main' 兜底
 */
function resolveAgentScope(
  bctx: BridgeContext,
  accountId: string,
  conversationId: string,
): string {
  const config = bctx.config
  const acct = config.accounts?.[accountId]

  // 1. 账号级 routes
  const acctRoute = acct?.routes?.find((r) => r.conversationId === conversationId)
  if (acctRoute) return acctRoute.agentScope ?? 'main'

  // 2. 顶层 routes
  const route = config.routes?.find((r) => r.conversationId === conversationId)
  if (route) return route.agentScope ?? 'main'

  // 3. bindings 反查
  const agentIds = bctx.bindingsIndex?.byAccountId.get(accountId) ?? []
  if (agentIds.length > 0) return agentIds[0]

  // 4. 兜底
  return 'main'
}

export function routeSession(bctx: BridgeContext, msg: DingtalkInboundMessage): SessionRouting {
  const config = bctx.config
  const accountId = msg.accountId ?? 'default'
  const conversationId = msg.conversationId
  const isGroup = msg.conversationType === '2'

  // 0. 取账号级 groupCfg（PR-4：账号覆盖优先）
  const acct = config.accounts?.[accountId]
  const globalGroupCfg = isGroup ? config.groups?.[conversationId] : undefined
  const acctGroupCfg = isGroup ? acct?.groups?.[conversationId] : undefined
  const groupCfg = acctGroupCfg ?? globalGroupCfg

  // 1. 计算 sessionScope
  const sessionScope = (groupCfg?.groupSessionScope ?? (isGroup ? 'group' : 'group')) as
    | 'group'
    | 'group_sender'

  // 2. 计算 sessionId（含 accountId）
  const sender = msg.senderStaffId ?? msg.senderId ?? 'unknown'
  const sessionId = buildSessionId({
    accountId,
    isGroup,
    conversationId,
    scope: sessionScope,
    sender: sessionScope === 'group_sender' ? sender : undefined,
  })

  // 3. 决定 agent scope
  const agentScope = resolveAgentScope(bctx, accountId, conversationId)

  return {
    sessionId,
    agentScope,
    sessionScope,
    accountId,
  }
}

// =============================================================================
// AgentHandle 创建/恢复
// =============================================================================

/**
 * 通过 ctx.agents.create 或 resume 拿到 AgentHandle。
 *
 * 简化策略：始终尝试 resume；如果失败（无持久化记录），fallback 到 create。
 */
export async function createOrResumeAgentHandle(
  bctx: BridgeContext,
  routing: SessionRouting,
): Promise<import('@deepseek-ai/dsh-agent').AgentHandle> {
  const agents = bctx.ctx['agents'] as
    | {
        create: (opts: unknown) => Promise<import('@deepseek-ai/dsh-agent').AgentHandle>
        resume: (opts: unknown) => Promise<import('@deepseek-ai/dsh-agent').AgentHandle>
        findBySessionId?: (id: string) => import('@deepseek-ai/dsh-agent').AgentHandle | undefined
      }
    | undefined

  if (!agents) {
    throw new Error(
      '[dingtalk-channel] ctx.agents not available; load @deepseek-ai/dsh-agent-loop and @deepseek-ai/dsh-session-persistence-jsonl before this plugin',
    )
  }

  const existing = agents.findBySessionId?.(routing.sessionId)
  if (existing) return existing

  try {
    const handle = await agents.resume({
      resumeSessionId: routing.sessionId,
      setup: (agentCtx: Context) => installChannelScopedTools(agentCtx, bctx, routing),
    })
    log.info('resumed agent', { sessionId: routing.sessionId, agentScope: routing.agentScope })
    return handle
  } catch (err) {
    log.debug('resume failed, trying create', err)
  }

  const handle = await agents.create({
    sessionId: routing.sessionId,
    meta: { cwd: process.cwd() },
    setup: (agentCtx: Context) => installChannelScopedTools(agentCtx, bctx, routing),
  })
  log.info('created agent', { sessionId: routing.sessionId, agentScope: routing.agentScope })
  return handle
}

/**
 * 给特定 agent scope 安装钉钉 channel-scope 工具和 persona。
 *
 * PR-4：per-account systemPrompt 优先于顶层 systemPrompt
 */
function installChannelScopedTools(
  agentCtx: Context,
  bctx: BridgeContext,
  routing: SessionRouting,
): void {
  const tools = agentCtx['tools'] as { register?: (def: unknown) => () => void } | undefined
  if (tools?.register) {
    // 复用 tools/index 里的定义
    // 这里只安装 channel 专用 tool（dingtalk_reply_now），其他通用 tool 由 preset 提供
  }

  const systemPrompt = agentCtx['systemPrompt'] as { register?: (def: unknown) => () => void } | undefined
  if (systemPrompt?.register) {
    systemPrompt.register({
      id: `channel-dingtalk:${routing.sessionId}`,
      section: buildChannelSystemPrompt(bctx, routing),
    })
  }
}

function buildChannelSystemPrompt(bctx: BridgeContext, routing: SessionRouting): string {
  const parts: string[] = []
  parts.push(
    `你正在通过钉钉 channel 与用户对话。`,
    `当前会话 ID：${routing.sessionId}`,
    `账号：${routing.accountId}`,
    `会话范围：${routing.sessionScope}`,
  )
  // PR-4: 账号级 systemPrompt 优先于顶层
  const accountPrompt = bctx.config.accounts?.[routing.accountId]
  const prompt = (accountPrompt as { systemPrompt?: string } | undefined)?.systemPrompt ?? bctx.config.systemPrompt
  if (prompt) {
    parts.push('---', prompt)
  }
  return parts.join('\n')
}