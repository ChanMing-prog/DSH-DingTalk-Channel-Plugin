/**
 * Multi-account resolution — 多账号凭证 / 配置 / 路由合并.
 *
 * Fork 自上游 connector 的 config/accounts.ts 形态（resolveDingtalkAccount /
 * resolveDingtalkCredentials / listDingtalkAccountIds / resolveDefaultDingtalkAccountId），
 * 但剥离 OpenClaw runtime 引用，改为纯函数 + 显式参数。
 *
 * 设计：
 *   - 默认账号 'default'：没配 accounts.* 时回退到顶层 clientId/clientSecret
 *   - 显式账号：accounts.<accountId>.* 覆盖顶层同名字段（merge base + override）
 *   - 每个账号独立缓存 accessToken（PR-2 tokens.ts 已经按 clientId 缓存）
 *
 * 提供：
 *   - listAccountIds(config) → string[]
 *   - resolveDefaultAccountId(config) → string
 *   - resolveAccountConfig(config, accountId) → ResolvedAccount（合并后）
 *   - resolveCredentials(config, accountId) → ResolvedDingtalkCredentials
 */

import type { DingtalkConfig, ChannelDingtalkSettings } from '../../settings-schema.js'
import type { ResolvedDingtalkCredentials } from '../types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-accounts')

// =============================================================================
// 类型
// =============================================================================

export type SelectionSource =
  | 'explicit-default' // 配置里 defaultAccount 显式指定
  | 'mapped-default' // accounts.* 字典里唯一账号被自动作为 default
  | 'fallback' // 没配 accounts 时使用 'default'（顶层 clientId/clientSecret）

/**
 * 解析后的单账号配置：把顶层 DingtalkConfig 与 accounts[accountId] merge，
 * 账号级字段优先。
 */
export interface ResolvedAccount {
  accountId: string
  selectionSource: SelectionSource
  enabled: boolean
  configured: boolean
  name?: string
  clientId?: string | number
  clientSecret?: string | { source: 'env' | 'file' | 'exec'; provider: string; id: string }
  chatbotUserId?: string
  /** 合并后的完整配置（顶层 + 账号覆盖） */
  config: DingtalkConfig
  /** 此账号的私聊/群聊 settings（合并后） */
  policies: {
    dmPolicy: 'open' | 'pairing' | 'allowlist'
    allowFrom: Array<string | number>
    groupPolicy: 'open' | 'allowlist' | 'disabled'
    groupAllowFrom: Array<string | number>
    requireMention: boolean
    groups: Record<
      string,
      {
        requireMention?: boolean
        enabled?: boolean
        allowFrom?: Array<string | number>
        systemPrompt?: string
        groupSessionScope?: 'group' | 'group_sender'
      }
    >
    routes: Array<{ conversationId: string; agentScope?: string }>
  }
}

// =============================================================================
// 工具函数
// =============================================================================

/** 列出所有账号 ID（含 'default' 兜底）*/
export function listAccountIds(config: DingtalkConfig): string[] {
  const accounts = config.accounts ?? {}
  const ids = Object.keys(accounts).filter((id) => accounts[id]?.enabled !== false)
  if (ids.length === 0) return ['default']
  return ids
}

/**
 * 解析 default accountId.
 * - 配置里 explicit defaultAccount 且 accounts[defaultAccount] 存在 → 'explicit-default'
 * - 没显式配置但 accounts.* 有唯一 enabled 的 → 'mapped-default'
 * - 否则 → 'fallback'（顶层 clientId/clientSecret）
 */
export function resolveDefaultAccountId(config: DingtalkConfig): {
  accountId: string
  source: SelectionSource
} {
  const accounts = config.accounts ?? {}

  // 1. explicit
  if (config.defaultAccount && accounts[config.defaultAccount]) {
    return { accountId: config.defaultAccount, source: 'explicit-default' }
  }

  // 2. mapped (only one enabled)
  const enabled = Object.entries(accounts).filter(([, a]) => a?.enabled !== false)
  if (enabled.length === 1) {
    return { accountId: enabled[0][0], source: 'mapped-default' }
  }

  // 3. fallback
  return { accountId: 'default', source: 'fallback' }
}

// =============================================================================
// 配置合并
// =============================================================================

function mergePolicies(
  base: DingtalkConfig,
  acct: DingtalkConfig['accounts'] extends Record<string, infer V> ? V | undefined : never,
) {
  type AcctT = NonNullable<DingtalkConfig['accounts']>[string]
  const a = acct as AcctT | undefined
  return {
    dmPolicy: a?.dmPolicy ?? base.dmPolicy,
    allowFrom: a?.allowFrom ?? base.allowFrom ?? [],
    groupPolicy: a?.groupPolicy ?? base.groupPolicy,
    groupAllowFrom: a?.groupAllowFrom ?? base.groupAllowFrom ?? [],
    requireMention: a?.requireMention ?? base.requireMention,
    groups: {
      ...(base.groups ?? {}),
      ...(a?.groups ?? {}),
    },
    routes: a?.routes ?? base.routes ?? [],
  }
}

/**
 * 把 accounts[accountId] 与顶层 DingtalkConfig 合并成一个完整的账号配置.
 */
export function resolveAccountConfig(
  config: DingtalkConfig,
  accountId: string,
): ResolvedAccount {
  const accounts = config.accounts ?? {}
  const isFallback = accountId === 'default' && Object.keys(accounts).length === 0
  const acct = accounts[accountId]
  const enabled = acct?.enabled !== false
  const configured = isFallback
    ? !!(config.clientId && config.clientSecret)
    : !!(acct?.clientId && acct?.clientSecret)

  return {
    accountId,
    selectionSource: isFallback ? 'fallback' : 'mapped-default',
    enabled,
    configured,
    name: acct?.name,
    clientId: acct?.clientId ?? config.clientId,
    clientSecret: acct?.clientSecret ?? config.clientSecret,
    chatbotUserId: acct?.chatbotUserId,
    config,
    policies: mergePolicies(config, acct),
  }
}

// =============================================================================
// 凭证解析
// =============================================================================

function resolveSecretFromEnv(envVarName: string): string | undefined {
  const v = process.env[envVarName]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function resolveSecretFromStructured(
  ref: { source: 'env' | 'file' | 'exec'; provider: string; id: string },
): string | undefined {
  if (ref.source === 'env') {
    return resolveSecretFromEnv(ref.id)
  }
  // file/exec 解析留给 DSH credentials seam（PR-5 接入）
  log.warn(`clientSecret.source=${ref.source} not yet supported; reading from env ${ref.id}`)
  return resolveSecretFromEnv(ref.id)
}

/**
 * 把一个账号配置解析为运行时凭证（clientId + clientSecret 字符串）.
 *
 * 解析顺序：
 *   1. accounts[accountId].clientSecret 是字符串 → 直接用
 *   2. accounts[accountId].clientSecret 是结构化引用 → resolveSecretFromStructured
 *   3. 顶层 clientId/clientSecret（同上）
 *   4. 环境变量 DINGTALK_<ACCOUNTID>_CLIENT_ID / _CLIENT_SECRET（账号级）
 *   5. 环境变量 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET（兜底）
 */
export function resolveCredentials(
  config: DingtalkConfig,
  accountId: string,
): ResolvedDingtalkCredentials {
  const acct = config.accounts?.[accountId]

  // clientId 优先级
  let clientId: string | number | undefined
  if (typeof acct?.clientId === 'string' || typeof acct?.clientId === 'number') {
    clientId = acct.clientId
  } else if (typeof config.clientId === 'string' || typeof config.clientId === 'number') {
    clientId = config.clientId
  } else {
    const envVar =
      accountId === 'default'
        ? 'DINGTALK_CLIENT_ID'
        : `DINGTALK_${accountId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_CLIENT_ID`
    const v = resolveSecretFromEnv(envVar)
    if (v) clientId = v
  }

  // clientSecret 优先级
  let clientSecret: string | undefined
  const csecRef = acct?.clientSecret ?? config.clientSecret
  if (typeof csecRef === 'string') {
    clientSecret = csecRef
  } else if (csecRef && typeof csecRef === 'object') {
    clientSecret = resolveSecretFromStructured(csecRef)
  } else {
    const envVar =
      accountId === 'default'
        ? 'DINGTALK_CLIENT_SECRET'
        : `DINGTALK_${accountId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_CLIENT_SECRET`
    clientSecret = resolveSecretFromEnv(envVar)
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      `[dingtalk-accounts] missing credentials for accountId="${accountId}". ` +
        `Set accounts.${accountId}.clientId/clientSecret, or use env vars ` +
        `DINGTALK_${accountId === 'default' ? '' : '<ACCOUNT>'}CLIENT_ID / _CLIENT_SECRET`,
    )
  }

  return { clientId: String(clientId), clientSecret }
}

// =============================================================================
// Schemastery 输入适配
// =============================================================================

/**
 * 把 DSH settings 形态（ChannelDingtalkSettings）转换为 DingtalkConfig 形态。
 * 兼容 settings 文档只暴露顶层字段、不展开 accounts/bindings 的场景。
 *
 * 如果 settings 没暴露 accounts/bindings，则直接用 settings 当 config。
 */
export function fromSettings(settings: ChannelDingtalkSettings): DingtalkConfig {
  return settings as unknown as DingtalkConfig
}