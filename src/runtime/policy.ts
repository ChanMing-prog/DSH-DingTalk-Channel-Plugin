/**
 * Message Policy — 群/私聊准入与安全策略.
 *
 * PR-4: 支持 per-account policy 覆盖（accounts.<id>.dmPolicy 等优先于顶层）。
 */

import type { BridgeContext, DingtalkInboundMessage } from '../types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-policy')

export type PolicyDecision =
  | { accept: true }
  | { accept: false; reason: string }

/**
 * 合并顶层 config 与 account 级 override.
 * 账号级字段优先.
 */
function mergedPolicies(bctx: BridgeContext) {
  const cfg = bctx.config
  const acct = cfg.accounts?.[bctx.accountId]
  return {
    dmPolicy: acct?.dmPolicy ?? cfg.dmPolicy,
    allowFrom: acct?.allowFrom ?? cfg.allowFrom ?? [],
    groupPolicy: acct?.groupPolicy ?? cfg.groupPolicy,
    groupAllowFrom: acct?.groupAllowFrom ?? cfg.groupAllowFrom ?? [],
    requireMention: acct?.requireMention ?? cfg.requireMention ?? true,
    groups: { ...(cfg.groups ?? {}), ...(acct?.groups ?? {}) },
  }
}

export function handleMessagePolicy(bctx: BridgeContext, msg: DingtalkInboundMessage): PolicyDecision {
  const policies = mergedPolicies(bctx)
  const isGroup = msg.conversationType === '2'

  // 0. enabled check
  if (!bctx.config.enabled) {
    return { accept: false, reason: 'plugin disabled' }
  }

  // 1. 全局白名单（合并后）
  if (policies.allowFrom.length > 0) {
    const sender = msg.senderStaffId ?? msg.senderId
    if (sender && !policies.allowFrom.includes(sender)) {
      return { accept: false, reason: 'sender not in allowFrom' }
    }
  }

  if (isGroup) {
    return groupPolicy(bctx, policies, msg)
  }
  return dmPolicy(bctx, policies, msg)
}

function groupPolicy(
  _bctx: BridgeContext,
  policies: ReturnType<typeof mergedPolicies>,
  msg: DingtalkInboundMessage,
): PolicyDecision {
  const groupCfg = policies.groups?.[msg.conversationId]

  if (groupCfg?.enabled === false) {
    return { accept: false, reason: 'group disabled' }
  }

  const policy = policies.groupPolicy
  if (policy === 'disabled') {
    return { accept: false, reason: 'groupPolicy=disabled' }
  }

  const groupAllowFrom = groupCfg?.allowFrom ?? policies.groupAllowFrom ?? []
  if (policy === 'allowlist') {
    if (groupAllowFrom.length === 0) {
      return { accept: false, reason: 'group allowlist is empty' }
    }
    const sender = msg.senderStaffId ?? msg.senderId
    if (!sender || !groupAllowFrom.includes(sender)) {
      return { accept: false, reason: 'sender not in group allowlist' }
    }
  }

  const requireMention = groupCfg?.requireMention ?? policies.requireMention ?? true
  if (requireMention && !msg.isInAtList) {
    return { accept: false, reason: 'message did not @ bot' }
  }

  return { accept: true }
}

function dmPolicy(
  bctx: BridgeContext,
  policies: ReturnType<typeof mergedPolicies>,
  msg: DingtalkInboundMessage,
): PolicyDecision {
  const policy = policies.dmPolicy ?? 'pairing'
  const sender = msg.senderStaffId ?? msg.senderId ?? '<unknown>'

  if (policy === 'open') {
    return { accept: true }
  }

  if (policy === 'allowlist') {
    const allow = policies.allowFrom ?? []
    if (allow.length === 0) {
      return { accept: false, reason: 'dm allowlist is empty' }
    }
    if (!allow.includes(sender)) {
      return { accept: false, reason: 'sender not in dm allowlist' }
    }
    return { accept: true }
  }

  // pairing（默认）
  if (bctx.pairedStaffIds.has(sender)) {
    return { accept: true }
  }
  void emitPairingCode(bctx, sender)
  return { accept: false, reason: 'pairing required' }
}

async function emitPairingCode(bctx: BridgeContext, sender: string): Promise<void> {
  log.info(
    `[pairing] new dm sender ${sender} on accountId=${bctx.accountId}; ` +
      `in production, send one-time pairing code via dingtalk message API`,
  )
}