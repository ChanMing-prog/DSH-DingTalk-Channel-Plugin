/**
 * Settings + Credentials registration
 *
 * 把 channel-dingtalk 命名空间注册到 ctx.settings，把 clientId/clientSecret
 * 注册到 ctx.credentials（只引用环境变量）。
 *
 * 这些方法从 apply() 拆分出来以便：1) 让 apply 保持线性；2) 测试时可以单独
 * 调用任意一个；3) 未来 `tools-only` 入口可以复用其中一部分。
 */

import type { Context } from 'cordis'
import { ChannelDingtalkSettingsSchema, type DingtalkConfig } from '../../settings-schema.js'
import type { ResolvedDingtalkCredentials } from '../types.js'
import { createLogger } from '../utils/logger.js'
import { resolveCredentials as resolveAccounts } from '../apis/accounts.js'

const log = createLogger('dingtalk-setup')

/**
 * 把 schemastery schema 注册到 ctx.settings。
 *
 * DSH 标准做法：ctx.settings.register(namespace, schema, options?)
 *   - namespace: 字符串
 *   - schema: schemastery shape
 *   - options.base: composition-time base（来自 cordis.yml 的 entry config）
 *
 * 凭证字段标了 role: 'credential'，由 ctx.credentials 接管。
 */
export function registerSettings(ctx: Context): void {
  const settings = ctx['settings'] as
    | {
        register: (
          namespace: string,
          schema: unknown,
          options?: { base?: unknown; applies?: unknown },
        ) => unknown
      }
    | undefined

  if (!settings) {
    log.warn('ctx.settings not available; channel-dingtalk settings namespace will not be registered. Make sure @deepseek-ai/dsh-settings is loaded before this plugin.')
    return
  }

  settings.register('channel-dingtalk', ChannelDingtalkSettingsSchema, {
    applies: 'host',
  })
  log.debug('registered settings namespace channel-dingtalk')
}

/**
 * 注册钉钉凭证到 ctx.credentials（可选服务）。
 * 如果 ctx.credentials 不在（host composition 没加载 dsh-credentials），
 * 退化为读取 process.env。
 */
export function registerCredentials(ctx: Context): void {
  const credentials = ctx['credentials'] as
    | {
        register: (spec: {
          namespace: string
          entries: Array<{ id: string; envVar: string; description?: string }>
        }) => unknown
      }
    | undefined

  if (!credentials) {
    log.warn('ctx.credentials not available; will read DINGTALK_CLIENT_ID/SECRET directly from process.env')
    return
  }

  credentials.register({
    namespace: 'channel-dingtalk',
    entries: [
      {
        id: 'clientId',
        envVar: 'DINGTALK_CLIENT_ID',
        description: '钉钉企业内部应用 ClientID',
      },
      {
        id: 'clientSecret',
        envVar: 'DINGTALK_CLIENT_SECRET',
        description: '钉钉企业内部应用 ClientSecret',
      },
    ],
  })
  log.debug('registered credentials namespace channel-dingtalk')
}

/**
 * 解析凭证（默认账号 'default'）。这是 apply() 的入口；多账号场景下 stream.ts
 * 会用 apis/accounts.resolveCredentials() 逐个解析。
 *
 * 委派给 apis/accounts 的多账号实现（PR-4 统一了入口）。
 */
export function resolveCredentials(config: DingtalkConfig): ResolvedDingtalkCredentials {
  return resolveAccounts(config, 'default')
}

/**
 * 同 conversationId 的 access token 缓存（多账号时按 accountId 区分）
 */
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getAccessToken(credentials: ResolvedDingtalkCredentials): Promise<string> {
  const key = credentials.clientId
  const cached = accessTokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

  const { getDingtalkHttpClient } = await import('../utils/http-client.js')
  const http = getDingtalkHttpClient()
  const res = await http.post<{
    accessToken: string
    expireIn: number
  }>('/v1.0/oauth2/accessToken', {
    appKey: credentials.clientId,
    appSecret: credentials.clientSecret,
  })

  const expiresAt = Date.now() + res.data.expireIn * 1000
  accessTokenCache.set(key, { token: res.data.accessToken, expiresAt })
  return res.data.accessToken
}

export function clearAccessTokenCache(): void {
  accessTokenCache.clear()
}