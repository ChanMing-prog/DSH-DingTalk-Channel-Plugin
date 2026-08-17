/**
 * Session Routing — 钉钉 conversationId ↔ DSH SessionId 双向映射
 *
 * 关键决策：
 *   - 私聊：1 conversationId = 1 SessionId
 *   - 群聊：按 groupSessionScope 决定：
 *       'group'        → 全群共享一个 SessionId
 *       'group_sender' → 每个 senderStaffId 一个 SessionId（按群+人划分）
 *
 * 配置覆盖：
 *   - config.routes 显式指定 conversationId → agentScope
 *   - 默认 agentScope = 'main'
 *
 * SessionId 命名空间：用 `dingtalk:` 前缀避免和 CLI / Web / 其他来源冲突
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

export function routeSession(bctx: BridgeContext, msg: DingtalkInboundMessage): SessionRouting {
  const config = bctx.config
  const conversationId = msg.conversationId
  const isGroup = msg.conversationType === '2'

  // 1. 找到这个 conversationId 的群组配置
  const groupCfg = isGroup ? config.groups?.[conversationId] : undefined
  const sessionScope = groupCfg?.groupSessionScope ?? (isGroup ? 'group' : 'group')

  // 2. 计算 sessionId
  let sessionId: string
  if (isGroup && sessionScope === 'group_sender') {
    const sender = msg.senderStaffId ?? msg.senderId ?? 'unknown'
    sessionId = `${SESSION_PREFIX}g:${conversationId}:s:${sender}`
  } else {
    sessionId = `${SESSION_PREFIX}${isGroup ? 'g' : 'd'}:${conversationId}`
  }

  // 3. agent scope（routes 优先）
  let agentScope = 'main'
  const route = config.routes?.find((r) => r.conversationId === conversationId)
  if (route) {
    agentScope = route.agentScope ?? 'main'
  }

  return {
    sessionId,
    agentScope,
    sessionScope: sessionScope as 'group' | 'group_sender',
  }
}

// =============================================================================
// AgentHandle 创建/恢复
// =============================================================================

/**
 * 通过 ctx.agents.create 或 resume 拿到 AgentHandle。
 *
 * DSH ctx.agents API（参考 @deepseek-ai/dsh-agent + dsh-agent-loop）：
 *   - create({ sessionId, meta?, setup? })
 *   - resume({ resumeSessionId, setup? })
 *
 * 第一次进入：create（sessionPersistence 加载不到历史）
 * 后续进入：resume（sessionPersistence 自动加载历史）
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

  // 0. 已有现成 handle（同一进程内）
  const existing = agents.findBySessionId?.(routing.sessionId)
  if (existing) return existing

  // 1. 优先尝试 resume（依赖 sessionPersistence）
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

  // 2. fallback: create
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
 * DSH agent preset 模式：setup() 在 agent 创建/恢复时被调用，挂在 agent 自己的
 * scope 上。本函数做的事：
 *   1. 给该 agent 注册钉钉相关 tool（如果 preset 没有）
 *   2. 注入 system prompt 片段（@机器人提示等）
 */
function installChannelScopedTools(
  agentCtx: Context,
  bctx: BridgeContext,
  routing: SessionRouting,
): void {
  const tools = agentCtx['tools'] as { register?: (def: unknown) => () => void } | undefined
  if (tools?.register) {
    // 复用 tools/index 里的定义
    // 这里只安装 channel 专用 tool（dingtalk_reply_now），其他通用 tool
    // （dingtalk_send 等）由 preset 提供
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
    `会话范围：${routing.sessionScope}`,
  )
  if (bctx.config.systemPrompt) {
    parts.push('---', bctx.config.systemPrompt)
  }
  return parts.join('\n')
}