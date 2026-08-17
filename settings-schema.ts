/**
 * DSH Settings Schema for `channel-dingtalk`
 *
 * 注意：DSH 的 settings 使用 schemastery（不是 zod）。本文件同时导出 zod 版本
 * （用于运行时校验）和 schemastery 版本（用于 ctx.settings.register）。
 *
 * 上游 connector 用 zod 是因为 OpenClaw SDK 把 zod 作为 schema 标准。
 * DSH 选 schemastery 是因为它是 schemastery 的纯 JS 定义、能直接 derive 出
 * TypeScript 类型、并且支持 settings UI 自动渲染。
 */

import { z } from 'zod'

// =============================================================================
// 1. 内部校验用 zod schema（与上游 connector 的 DingtalkConfigBaseSchema 对齐）
//    用于 apply() 启动时对 entry config 做兜底校验
// =============================================================================

export const DingtalkConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultAccount: z.string().default('default'),

  clientId: z.union([z.string(), z.number()]).optional(),
  clientSecret: z
    .union([
      z.string(),
      z.object({
        source: z.enum(['env', 'file', 'exec']),
        provider: z.string().min(1),
        id: z.string().min(1),
      }),
    ])
    .optional(),

  enableMediaUpload: z.boolean().default(true),
  systemPrompt: z.string().default(''),

  dmPolicy: z.enum(['open', 'pairing', 'allowlist']).default('pairing'),
  allowFrom: z.array(z.union([z.string(), z.number()])).default([]),

  groupPolicy: z.enum(['open', 'allowlist', 'disabled']).default('allowlist'),
  groupAllowFrom: z.array(z.union([z.string(), z.number()])).default([]),
  requireMention: z.boolean().default(true),

  groups: z
    .record(
      z.string(),
      z.object({
        requireMention: z.boolean().optional(),
        enabled: z.boolean().optional(),
        allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
        systemPrompt: z.string().optional(),
        groupSessionScope: z.enum(['group', 'group_sender']).optional(),
      }),
    )
    .default({}),

  historyLimit: z.number().int().min(0).default(50),
  textChunkLimit: z.number().int().positive().default(4000),
  mediaMaxMb: z.number().positive().default(20),

  routes: z
    .array(
      z.object({
        conversationId: z.string(),
        agentScope: z.string().default('main'),
      }),
    )
    .default([]),

  // —— 多账号 / 多机器人 / bindings（PR-4）——
  /**
   * 多账号字典：key 是 accountId（默认 'default'）。
   * 不填则视作单账号模式，使用顶层的 clientId/clientSecret。
   */
  accounts: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean().default(true),
        /** 友好名（agent 写 "@开发机器人" 时触发 mention）*/
        name: z.string().optional(),
        /** 钉钉侧的加密机器人 ID（`$:LWCP_v1:$xxx`）。订阅 stream 回调后会拿到。*/
        chatbotUserId: z.string().optional(),
        /** 此账号专属凭证（不填则继承顶层 clientId/clientSecret）*/
        clientId: z.union([z.string(), z.number()]).optional(),
        clientSecret: z
          .union([
            z.string(),
            z.object({
              source: z.enum(['env', 'file', 'exec']),
              provider: z.string().min(1),
              id: z.string().min(1),
            }),
          ])
          .optional(),
        /** 此账号的私聊/群策略（不填继承顶层）*/
        dmPolicy: z.enum(['open', 'pairing', 'allowlist']).optional(),
        allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
        groupPolicy: z.enum(['open', 'allowlist', 'disabled']).optional(),
        groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
        requireMention: z.boolean().optional(),
        groups: z
          .record(
            z.string(),
            z.object({
              requireMention: z.boolean().optional(),
              enabled: z.boolean().optional(),
              allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
              systemPrompt: z.string().optional(),
              groupSessionScope: z.enum(['group', 'group_sender']).optional(),
            }),
          )
          .optional(),
        /** 此账号的专属 conversationId → agent scope 路由表 */
        routes: z
          .array(
            z.object({
              conversationId: z.string(),
              agentScope: z.string().default('main'),
            }),
          )
          .optional(),
      }),
    )
    .default({}),

  /**
   * bindings：把 OpenClaw 风格的 agent bindings 形态搬过来。
   * 每条形如 { agentId, match: { channel: 'dingtalk-connector', accountId: 'xxx' } }
   *
   * 用法 1：ap-is/bindings.ts 用它反查 "agentId → accountId → chatbotUserId"
   * 用法 2：runtime/session-routing.ts 用它把 "accountId" 映射到 "agentScope"
   */
  bindings: z
    .array(
      z.object({
        agentId: z.string(),
        match: z.object({
          channel: z.literal('dingtalk-connector'),
          accountId: z.string(),
        }),
      }),
    )
    .default([]),

  // —— bridge 专属 ——
  inboxWakeup: z.enum(['followup', 'steer']).default('followup'),
  streamTimeoutMs: z.number().int().positive().default(60000),
  jobsControllerName: z.string().default('dingtalk-stream'),
  aiCardReuseMs: z.number().int().positive().default(86_400_000),
  toolsOnly: z.boolean().default(false),
})

export type DingtalkConfig = z.infer<typeof DingtalkConfigSchema>

// =============================================================================
// 2. DSH schemastery 形态（导出供 ctx.settings.register 使用）
//
// DSH 的 schemastery API（基于 @deepseek-ai/dsh-settings 习惯）：
//   import { Schema } from '@deepseek-ai/dsh-settings'
//   Schema.object({ ... }).dict(...).array(...).union(...).boolean()...
//
// 凭证字段用 role('credential') 让 dsh-credentials 服务接管引用解析。
// =============================================================================

export const ChannelDingtalkSettingsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean', default: true },
    defaultAccount: { type: 'string', default: 'default' },

    clientId: {
      anyOf: [{ type: 'string' }, { type: 'number' }],
      // 不存值：seam 由 dsh-credentials 提供
    },
    clientSecret: {
      // schemastery 的 secret role：标记为凭据字段，配置 UI 不展示明文
      role: 'secret',
      anyOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['env', 'file', 'exec'] },
            provider: { type: 'string', minLength: 1 },
            id: { type: 'string', minLength: 1 },
          },
          required: ['source', 'provider', 'id'],
          additionalProperties: false,
        },
      ],
    },

    enableMediaUpload: { type: 'boolean', default: true },
    systemPrompt: { type: 'string', default: '' },

    dmPolicy: { type: 'string', enum: ['open', 'pairing', 'allowlist'], default: 'pairing' },
    allowFrom: {
      type: 'array',
      items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      default: [],
    },

    groupPolicy: { type: 'string', enum: ['open', 'allowlist', 'disabled'], default: 'allowlist' },
    groupAllowFrom: {
      type: 'array',
      items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      default: [],
    },
    requireMention: { type: 'boolean', default: true },

    groups: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          requireMention: { type: 'boolean' },
          enabled: { type: 'boolean' },
          allowFrom: {
            type: 'array',
            items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          },
          systemPrompt: { type: 'string' },
          groupSessionScope: { type: 'string', enum: ['group', 'group_sender'] },
        },
      },
      default: {},
    },

    historyLimit: { type: 'integer', minimum: 0, default: 50 },
    textChunkLimit: { type: 'integer', exclusiveMinimum: 0, default: 4000 },
    mediaMaxMb: { type: 'number', exclusiveMinimum: 0, default: 20 },

    routes: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          conversationId: { type: 'string' },
          agentScope: { type: 'string', default: 'main' },
        },
        required: ['conversationId'],
      },
    },

    // —— 多账号 / 多机器人 / bindings（PR-4）——
    accounts: {
      type: 'object',
      default: {},
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean', default: true },
          name: { type: 'string' },
          chatbotUserId: { type: 'string' },
          clientId: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          clientSecret: {
            role: 'secret',
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  source: { type: 'string', enum: ['env', 'file', 'exec'] },
                  provider: { type: 'string', minLength: 1 },
                  id: { type: 'string', minLength: 1 },
                },
                required: ['source', 'provider', 'id'],
                additionalProperties: false,
              },
            ],
          },
          dmPolicy: { type: 'string', enum: ['open', 'pairing', 'allowlist'] },
          allowFrom: {
            type: 'array',
            items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          },
          groupPolicy: { type: 'string', enum: ['open', 'allowlist', 'disabled'] },
          groupAllowFrom: {
            type: 'array',
            items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          },
          requireMention: { type: 'boolean' },
          groups: {
            type: 'object',
            additionalProperties: { type: 'object' },
          },
          routes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                conversationId: { type: 'string' },
                agentScope: { type: 'string', default: 'main' },
              },
              required: ['conversationId'],
              additionalProperties: false,
            },
          },
        },
      },
    },

    bindings: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentId: { type: 'string' },
          match: {
            type: 'object',
            additionalProperties: false,
            properties: {
              channel: { type: 'string', enum: ['dingtalk-connector'] },
              accountId: { type: 'string' },
            },
            required: ['channel', 'accountId'],
          },
        },
        required: ['agentId', 'match'],
      },
    },

    // bridge 专属
    inboxWakeup: { type: 'string', enum: ['followup', 'steer'], default: 'followup' },
    streamTimeoutMs: { type: 'integer', exclusiveMinimum: 0, default: 60000 },
    jobsControllerName: { type: 'string', default: 'dingtalk-stream' },
    aiCardReuseMs: { type: 'integer', exclusiveMinimum: 0, default: 86_400_000 },
    toolsOnly: { type: 'boolean', default: false },
  },
  required: [],
} as const

export type ChannelDingtalkSettings = {
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
  /** 多账号字典：accountId → DingtalkAccountConfig */
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
      routes?: Array<{ conversationId: string; agentScope?: string }>
    }
  >
  /** OpenClaw 风格的 bindings：agentId ↔ (channel, accountId) */
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