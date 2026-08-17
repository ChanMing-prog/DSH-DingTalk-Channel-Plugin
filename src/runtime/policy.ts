/**
 * Message Policy — 群/私聊准入与安全策略
 *
 * 对应上游 connector 的 policy.ts + onboarding.ts 中关于 dmPolicy/groupPolicy/
 * allowFrom/requireMention 的逻辑。
 */

import type { BridgeContext, DingtalkInboundMessage } from '../types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-policy')

export type PolicyDecision =
  | { accept: true }
  | { accept: false; reason: string }

export function handleMessagePolicy(bctx: BridgeContext, msg: DingtalkInboundMessage): PolicyDecision {
  const cfg = bctx.config
  const isGroup = msg.conversationType === '2'

  // 0. enabled check
  if (!cfg.enabled) {
    return { accept: false, reason: 'plugin disabled' }
  }

  // 1. 全局白名单（同时适用于群和私聊）
  if (cfg.allowFrom && cfg.allowFrom.length > 0) {
    const sender = msg.senderStaffId ?? msg.senderId
    if (sender && !cfg.allowFrom.includes(sender)) {
      return { accept: false, reason: 'sender not in allowFrom' }
    }
  }

  if (isGroup) {
    return groupPolicy(bctx, msg)
  }
  return dmPolicy(bctx, msg)
}

function groupPolicy(bctx: BridgeContext, msg: DingtalkInboundMessage): PolicyDecision {
  const cfg = bctx.config
  const groupCfg = cfg.groups?.[msg.conversationId]

  // 群级 enabled
  if (groupCfg?.enabled === false) {
    return { accept: false, reason: 'group disabled' }
  }

  // 群级 policy
  const policy = groupCfg ? cfg.groupPolicy : cfg.groupPolicy
  if (policy === 'disabled') {
    return { accept: false, reason: 'groupPolicy=disabled' }
  }

  // 群级 allowFrom
  const groupAllowFrom = groupCfg?.allowFrom ?? cfg.groupAllowFrom ?? []
  if (policy === 'allowlist') {
    if (groupAllowFrom.length === 0) {
      // allowlist 模式但列表为空 → 拒绝（安全默认）
      return { accept: false, reason: 'group allowlist is empty' }
    }
    const sender = msg.senderStaffId ?? msg.senderId
    if (!sender || !groupAllowFrom.includes(sender)) {
      return { accept: false, reason: 'sender not in group allowlist' }
    }
  }

  // requireMention
  const requireMention = groupCfg?.requireMention ?? cfg.requireMention ?? true
  if (requireMention && !msg.isInAtList) {
    return { accept: false, reason: 'message did not @ bot' }
  }

  return { accept: true }
}

function dmPolicy(bctx: BridgeContext, msg: DingtalkInboundMessage): PolicyDecision {
  const cfg = bctx.config
  const policy = cfg.dmPolicy ?? 'pairing'
  const sender = msg.senderStaffId ?? msg.senderId ?? '<unknown>'

  if (policy === 'open') {
    return { accept: true }
  }

  if (policy === 'allowlist') {
    const allow = cfg.allowFrom ?? []
    if (allow.length === 0) {
      return { accept: false, reason: 'dm allowlist is empty' }
    }
    if (!allow.includes(sender)) {
      return { accept: false, reason: 'sender not in dm allowlist' }
    }
    return { accept: true }
  }

  // policy === 'pairing'（默认）
  if (bctx.pairedStaffIds.has(sender)) {
    return { accept: true }
  }
  // 第一次收到时静默丢弃，让 onboarding 流程发出配对码
  void emitPairingCode(bctx, sender)
  return { accept: false, reason: 'pairing required' }
}

async function emitPairingCode(bctx: BridgeContext, sender: string): Promise<void> {
  // 简化：发送一次性提示消息。完整 pairing 应该用 ctx.credentials 风格的
  // 配对码，本首版只打日志。
  log.info(`[pairing] new dm sender ${sender}; in production, send one-time pairing code via dingtalk message API`)
}