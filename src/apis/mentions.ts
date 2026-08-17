/**
 * Multi-bot @-mention resolver — 完整 fork 自上游 connector 的
 * services/messaging/mentions.ts.
 *
 * 目的：在多 Agent / 多 bot 群场景下，让 AI 写 "@dev-agent / @开发助手机器人"
 * 这样的自然语言时，自动替换成钉钉识别的 `@$:LWCP_v1:$xxxxx`（chatbotUserId 加密 ID），
 * 并补上 atDingtalkIds。
 *
 * 解析来源：`accounts.<id>` 下配置的所有 bot。每个 bot 提供 3 类别名：
 *   1. accountId（如 `dev-bot`）
 *   2. 配置里的友好名 name（如 `开发助手机器人`）
 *   3. 通过 bindings 反查的 agentId（如 `dev-agent`）
 *
 * 设计原则：
 *   - 不改变原始 AI 文本里不相关的 @ 内容
 *   - 只替换能明确对应到某个 bot 的 token
 *   - 幂等：已经是 `@$:LWCP_v1:$xxx` 格式的文本不会被二次替换
 */

import type { DingtalkConfig } from '../../settings-schema.js'
import { buildBindingsIndex, type BindingsIndex } from './bindings.js'

/** 单个 bot 的 @ 解析表项 */
export interface BotMentionEntry {
  accountId: string
  /** 钉钉侧加密机器人 ID（`$:LWCP_v1:$xxx`）*/
  chatbotUserId?: string
  /** 友好名（`accounts.<id>.name`）*/
  name?: string
  /** 通过 bindings 反查的 agentId 列表（1 个 bot 通常绑 1 个 agent）*/
  agentIds: string[]
  /** 所有候选别名的去重集合 */
  aliases: string[]
}

export interface BuildMentionTableOptions {
  /** 额外别名映射：key 为 alias，value 为 accountId。用于临时补充（例如 prompt 缩写）*/
  extraAliases?: Record<string, string>
  /**
   * 是否允许把"裸别名"（例如 `dev-agent`，前面没有 `@`）识别为 mention 目标。
   * 启用后不会直接改写原文，仅会把对应 chatbotUserId 注入 `injectedChatbotUserIds`，
   * 由上层在发送前自动追加 `@<chatbotUserId>` 到文末。
   */
  detectBareAliases?: boolean
}

// =============================================================================
// Mention table builder
// =============================================================================

/**
 * 从 config 构建「bot 别名 → chatbotUserId」解析表。
 * 会同时扫描 accounts.* 和 bindings[]（通过 bindings 反查 agentId）。
 */
export function buildBotMentionTable(
  config: DingtalkConfig | null | undefined,
  options: BuildMentionTableOptions = {},
  bindingsIndex?: BindingsIndex,
): BotMentionEntry[] {
  const accountsMap = (config?.accounts ?? {}) as Record<string, {
    enabled?: boolean
    name?: string
    chatbotUserId?: string
  }>
  const byAccountId = new Map<string, BotMentionEntry>()

  for (const [accountId, acct] of Object.entries(accountsMap)) {
    if (!acct) continue
    if (acct.enabled === false) continue
    byAccountId.set(accountId, {
      accountId,
      chatbotUserId: typeof acct.chatbotUserId === 'string' ? acct.chatbotUserId.trim() || undefined : undefined,
      name: typeof acct.name === 'string' ? acct.name.trim() || undefined : undefined,
      agentIds: [],
      aliases: [],
    })
  }

  // bindings → 反查 agentIds
  const idx = bindingsIndex ?? (config ? buildBindingsIndex(config) : null)
  if (idx) {
    for (const b of idx.bindings) {
      const entry = byAccountId.get(b.match.accountId)
      if (!entry) continue
      if (!entry.agentIds.includes(b.agentId)) entry.agentIds.push(b.agentId)
    }
  }

  // extraAliases
  const extraMap = new Map<string, string>()
  if (options.extraAliases) {
    for (const [alias, accountId] of Object.entries(options.extraAliases)) {
      if (alias && accountId) extraMap.set(alias.toLowerCase(), accountId)
    }
  }

  for (const entry of byAccountId.values()) {
    const aliasSet = new Set<string>()
    aliasSet.add(entry.accountId)
    if (entry.name) aliasSet.add(entry.name)
    for (const aid of entry.agentIds) aliasSet.add(aid)
    for (const [alias, accountId] of extraMap.entries()) {
      if (accountId === entry.accountId) aliasSet.add(alias)
    }
    entry.aliases = Array.from(aliasSet)
  }

  return Array.from(byAccountId.values())
}

// =============================================================================
// Mention resolution
// =============================================================================

/** chatbotUserId 加密 ID 的正则 */
const CHATBOT_ID_PATTERN = /\$:LWCP_v1:\$[A-Za-z0-9+/=]+/g

/**
 * 把一批 accountId 解析成对应的 chatbotUserId 数组。
 * 找不到 chatbotUserId 的账号会被跳过，并通过 `missing` 报告。
 */
export function resolveAtAccountIdsToChatbotUserIds(
  config: DingtalkConfig | null | undefined,
  atAccountIds: string[] | undefined,
  bindingsIndex?: BindingsIndex,
): { resolved: string[]; missing: string[] } {
  if (!atAccountIds || atAccountIds.length === 0) {
    return { resolved: [], missing: [] }
  }
  const table = buildBotMentionTable(config, {}, bindingsIndex)
  const byAccountId = new Map(table.map((e) => [e.accountId, e]))
  const resolved: string[] = []
  const missing: string[] = []
  for (const id of atAccountIds) {
    if (!id) continue
    const entry = byAccountId.get(id)
    if (entry?.chatbotUserId) {
      resolved.push(entry.chatbotUserId)
    } else {
      missing.push(id)
    }
  }
  return { resolved, missing }
}

/**
 * 对文本中的 @ 别名做自动替换：
 *   1. `@<alias>` → `@<chatbotUserId>`（alias 命中某个 bot 时）
 *   2. 已经是 `@$:LWCP_v1:$xxx` 形式的 @ 原样保留
 *
 * 返回：
 *   - `text`：替换后的文本
 *   - `injectedChatbotUserIds`：本次替换中涉及到的 chatbotUserId 列表
 */
export function substituteBotMentions(
  text: string,
  config: DingtalkConfig | null | undefined,
  options: BuildMentionTableOptions = {},
  bindingsIndex?: BindingsIndex,
): { text: string; injectedChatbotUserIds: string[] } {
  if (!text || typeof text !== 'string') {
    return { text: text ?? '', injectedChatbotUserIds: [] }
  }
  const table = buildBotMentionTable(config, options, bindingsIndex)

  // 别名 → chatbotUserId 查找表（不区分大小写，长别名优先匹配）
  const aliasToChatbotUserId = new Map<string, string>()
  for (const entry of table) {
    if (!entry.chatbotUserId) continue
    for (const alias of entry.aliases) {
      const key = alias.toLowerCase()
      if (!aliasToChatbotUserId.has(key)) {
        aliasToChatbotUserId.set(key, entry.chatbotUserId)
      }
    }
  }

  if (aliasToChatbotUserId.size === 0) {
    return { text, injectedChatbotUserIds: [] }
  }

  // 按别名长度降序替换，避免 "dev-agent" 被短别名 "dev" 先匹配掉
  const aliases = Array.from(aliasToChatbotUserId.keys()).sort((a, b) => b.length - a.length)
  const injected = new Set<string>()
  let out = text

  for (const alias of aliases) {
    const chatbotUserId = aliasToChatbotUserId.get(alias)!
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`@(${escaped})(?![A-Za-z0-9_\\u4e00-\\u9fff\\-])`, 'gi')
    out = out.replace(pattern, (match, _matched, offset: number) => {
      const before = out.slice(Math.max(0, offset - 1), offset)
      if (before === '$') return match
      injected.add(chatbotUserId)
      return `@${chatbotUserId}`
    })
  }

  // 兜底：识别裸别名
  if (options.detectBareAliases) {
    for (const alias of aliases) {
      const chatbotUserId = aliasToChatbotUserId.get(alias)!
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(
        `(?<![@A-Za-z0-9_\\u4e00-\\u9fff\\-])(${escaped})(?![A-Za-z0-9_\\u4e00-\\u9fff\\-])`,
        'gi',
      )
      if (pattern.test(out)) {
        injected.add(chatbotUserId)
      }
    }
  }

  // 收集已经在文本里的 @$:LWCP_v1:$xxx
  const rawIds = out.match(CHATBOT_ID_PATTERN) || []
  for (const id of rawIds) injected.add(id)

  return { text: out, injectedChatbotUserIds: Array.from(injected) }
}

/**
 * 高层入口：同时处理显式 atAccountIds + 文本里的自然语言 @。
 *
 * 用于 dingtalk_send 系列工具在调 sendProactive 前准备好最终的 content / atDingtalkIds。
 */
export function prepareMultiBotMentions(params: {
  config: DingtalkConfig | null | undefined
  content: string
  atAccountIds?: string[]
  atDingtalkIds?: string[]
  extraAliases?: Record<string, string>
  bindingsIndex?: BindingsIndex
}): {
  content: string
  atDingtalkIds: string[]
  missingAccountIds: string[]
} {
  const {
    config,
    content,
    atAccountIds,
    atDingtalkIds = [],
    extraAliases,
    bindingsIndex,
  } = params

  const explicit = resolveAtAccountIdsToChatbotUserIds(config, atAccountIds, bindingsIndex)
  const substituted = substituteBotMentions(
    content,
    config,
    { extraAliases, detectBareAliases: true },
    bindingsIndex,
  )

  const merged = new Set<string>()
  for (const id of atDingtalkIds) if (id) merged.add(id)
  for (const id of explicit.resolved) merged.add(id)
  for (const id of substituted.injectedChatbotUserIds) merged.add(id)

  let finalContent = substituted.text
  for (const id of explicit.resolved) {
    if (!finalContent.includes(`@${id}`)) {
      finalContent = `${finalContent} @${id}`
    }
  }

  return {
    content: finalContent,
    atDingtalkIds: Array.from(merged),
    missingAccountIds: explicit.missing,
  }
}