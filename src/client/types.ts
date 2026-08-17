/**
 * Client-side types — mirrored from settings-schema.ts but React-friendly.
 *
 * We intentionally duplicate these types (rather than import from settings-schema.ts)
 * so the client bundle stays small and dependency-free. The shape MUST stay
 * in sync with settings-schema.ts (enforced by tests/typert.test.ts).
 */

export type DingTalkConfig = {
  enabled?: boolean
  defaultAccount?: string
  clientId?: string | number
  clientSecret?: string | { source: 'env' | 'file' | 'exec'; provider: string; id: string }
  enableMediaUpload?: boolean
  systemPrompt?: string
  dmPolicy?: 'open' | 'pairing' | 'allowlist'
  allowFrom?: Array<string | number>
  groupPolicy?: 'open' | 'allowlist' | 'disabled'
  groupAllowFrom?: Array<string | number>
  requireMention?: boolean
  groups?: Record<
    string,
    {
      requireMention?: boolean
      enabled?: boolean
      allowFrom?: Array<string | number>
      systemPrompt?: string
      groupSessionScope?: 'group' | 'group_sender'
    }
  >
  historyLimit?: number
  textChunkLimit?: number
  mediaMaxMb?: number
  routes?: Array<{ conversationId: string; agentScope?: string }>
  accounts?: Record<
    string,
    {
      enabled?: boolean
      name?: string
      chatbotUserId?: string
      clientId?: string | number
      clientSecret?: string | { source: 'env' | 'file' | 'exec'; provider: string; id: string }
      dmPolicy?: 'open' | 'pairing' | 'allowlist'
      allowFrom?: Array<string | number>
      groupPolicy?: 'open' | 'allowlist' | 'disabled'
      groupAllowFrom?: Array<string | number>
      requireMention?: boolean
      groups?: Record<string, DingTalkConfig['groups'] extends Record<string, infer V> ? V : never>
      routes?: Array<{ conversationId: string; agentScope?: string }>
    }
  >
  bindings?: Array<{
    agentId: string
    match: { channel: 'dingtalk-connector'; accountId: string }
  }>
  inboxWakeup?: 'followup' | 'steer'
  streamTimeoutMs?: number
  jobsControllerName?: string
  aiCardReuseMs?: number
  toolsOnly?: boolean
}

export type ConfigStatus = {
  ok: boolean
  enabledCount: number
  missingAccountsInBindings: string[]
  warnings: string[]
  info: string[]
}

export interface ChannelCardProps {
  /** 当前 settings namespace 值（base + user merged） */
  config: DingTalkConfig
  /** 用户编辑中的草稿（initially = config） */
  draft: DingtalkDraft
  /** 字段变化时回调 */
  onChange: (draft: DingtalkDraft) => void
  /** 配置健康度 */
  status: ConfigStatus
  /** locale 字典（来自 typert/locale） */
  locale: Record<string, string>
}

/**
 * 全局 draft 形态 — settings 整个 namespace 的草稿。
 * 所有字段可选（用户还没编辑的字段保持原值）。
 */
export type DingtalkDraft = Partial<DingTalkConfig>