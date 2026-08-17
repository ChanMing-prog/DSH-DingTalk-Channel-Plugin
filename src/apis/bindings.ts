/**
 * Bindings resolution — bindings[] → agentId / accountId 双向查找.
 *
 * OpenClaw bindings 形态：
 *   bindings: [
 *     { agentId: 'dev-agent', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } },
 *     { agentId: 'pm-agent',  match: { channel: 'dingtalk-connector', accountId: 'pm-bot' } },
 *   ]
 *
 * 用法：
 *   - 反向：accountId → agentIds (用于 mentions 表里 alias 列表)
 *   - 正向：agentId → accountId (用于 DSH session-routing 把 account 映射到 agent scope)
 *   - 校验：bindings 引用的 accountId 都必须在 accounts.* 存在
 */

import type { DingtalkConfig } from '../../settings-schema.js'

export interface DingtalkBinding {
  agentId: string
  match: { channel: 'dingtalk-connector'; accountId: string }
}

export interface BindingsIndex {
  /** agentId → accountId */
  byAgentId: Map<string, string>
  /** accountId → agentIds[] (1 个 bot 可绑多个 agent) */
  byAccountId: Map<string, string[]>
  /** 原始 bindings */
  bindings: DingtalkBinding[]
}

/**
 * 构建 bindings 索引.
 */
export function buildBindingsIndex(config: DingtalkConfig): BindingsIndex {
  const bindings = (config.bindings ?? []).filter(isDingtalkConnectorBinding)
  const byAgentId = new Map<string, string>()
  const byAccountId = new Map<string, string[]>()

  for (const b of bindings) {
    if (!byAgentId.has(b.agentId)) {
      byAgentId.set(b.agentId, b.match.accountId)
    }
    const list = byAccountId.get(b.match.accountId) ?? []
    if (!list.includes(b.agentId)) {
      list.push(b.agentId)
      byAccountId.set(b.match.accountId, list)
    }
  }

  return { byAgentId, byAccountId, bindings }
}

function isDingtalkConnectorBinding(b: unknown): b is DingtalkBinding {
  if (!b || typeof b !== 'object') return false
  const r = b as Record<string, unknown>
  const match = r['match']
  if (!match || typeof match !== 'object') return false
  const m = match as Record<string, unknown>
  return (
    typeof r['agentId'] === 'string' &&
    typeof m['channel'] === 'string' &&
    m['channel'] === 'dingtalk-connector' &&
    typeof m['accountId'] === 'string'
  )
}

/**
 * agentId → accountId. 未找到返回 undefined.
 */
export function accountIdForAgent(index: BindingsIndex, agentId: string): string | undefined {
  return index.byAgentId.get(agentId)
}

/**
 * accountId → agentIds[]. 未找到返回 [].
 */
export function agentIdsForAccount(index: BindingsIndex, accountId: string): string[] {
  return index.byAccountId.get(accountId) ?? []
}

/**
 * 校验：bindings 引用的所有 accountId 都必须在 accounts.* 存在（或为 'default' 兜底）.
 * 返回缺失的 accountId 列表（用于 log 警告）。
 */
export function validateBindings(config: DingtalkConfig): {
  missing: string[]
  valid: DingtalkBinding[]
} {
  const accounts = config.accounts ?? {}
  const bindings = (config.bindings ?? []).filter(isDingtalkConnectorBinding)
  const valid: DingtalkBinding[] = []
  const missing: string[] = []

  for (const b of bindings) {
    const aid = b.match.accountId
    if (aid === 'default' || accounts[aid]) {
      valid.push(b)
    } else if (!missing.includes(aid)) {
      missing.push(aid)
    }
  }
  return { missing, valid }
}