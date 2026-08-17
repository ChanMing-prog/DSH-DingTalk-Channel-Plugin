/**
 * Token Management — accessToken + oapiAccessToken 缓存
 *
 * 钉钉有两套 access token：
 *   - newAPI token（`/v1.0/oauth2/accessToken`，Robot OpenAPI 用，2h 过期）
 *     用于：消息发送、AI Card、stream callback
 *   - oapi token（`/v1.0/oauth2/oapiAccessToken`，legacy OAPI 用，2h 过期）
 *     用于：媒体上传（oapi/media/upload）、群信息查询等老接口
 *
 * 上游 connector 用 DINGTALK_API / DINGTALK_OAPI 两个常量切换 baseURL。
 * 本仓库沿用相同约定，但用统一的 getDingtalkHttpClient() 实例化 axois。
 *
 * 设计：
 *   - 同 clientId 缓存 token，避免每条消息都调一次接口
 *   - 提前 60s 视为过期，强制刷新
 *   - 多个 in-flight 请求共享同一个 token promise（避免雪崩）
 */

import type { AxiosInstance } from 'axios'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { createLogger } from '../utils/logger.js'
import type { ResolvedDingtalkCredentials } from '../types.js'

const log = createLogger('dingtalk-tokens')

export const DINGTALK_API = 'https://api.dingtalk.com'
export const DINGTALK_OAPI = 'https://oapi.dingtalk.com'

interface CachedToken {
  token: string
  expiresAt: number
  /** 同时存在的 in-flight promise，避免并发重复请求 */
  inflight?: Promise<string>
}

const tokenCache = new Map<string, CachedToken>()

const ACCESS_TOKEN_EXPIRE_MS = 2 * 60 * 60 * 1000 // 2h，钉钉官方约定
const REFRESH_BUFFER_MS = 60_000 // 提前 60s 视为过期

function cacheKey(creds: ResolvedDingtalkCredentials, kind: 'new' | 'oapi'): string {
  return `${kind}:${creds.clientId}`
}

/**
 * 获取 newAPI token。失败时抛错（调用方应捕获并降级到普通消息）。
 */
export async function getAccessToken(creds: ResolvedDingtalkCredentials): Promise<string> {
  const key = cacheKey(creds, 'new')
  const cached = tokenCache.get(key)
  const now = Date.now()

  if (cached?.token && cached.expiresAt - REFRESH_BUFFER_MS > now) {
    return cached.token
  }

  // 复用 in-flight promise
  if (cached?.inflight) {
    return cached.inflight
  }

  const promise = (async () => {
    try {
      const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
      const res = await http.post<{ accessToken: string; expireIn: number }>(
        '/v1.0/oauth2/accessToken',
        { appKey: creds.clientId, appSecret: creds.clientSecret },
      )
      const token = res.data.accessToken
      const expiresAt = Date.now() + res.data.expireIn * 1000
      // expireIn 应与 ACCESS_TOKEN_EXPIRE_MS 相近；强制使用声明值
      const expiresAtClamped = Math.min(expiresAt, Date.now() + ACCESS_TOKEN_EXPIRE_MS)
      tokenCache.set(key, { token, expiresAt: expiresAtClamped })
      log.debug('new-api access token refreshed', { clientId: creds.clientId, ttlSec: res.data.expireIn })
      return token
    } catch (err) {
      log.error('failed to get access token', err)
      tokenCache.delete(key)
      throw err
    } finally {
      const cur = tokenCache.get(key)
      if (cur?.inflight) tokenCache.set(key, { token: cur.token, expiresAt: cur.expiresAt })
    }
  })()

  tokenCache.set(key, { ...(cached ?? { token: '', expiresAt: 0 }), inflight: promise })
  return promise
}

/**
 * 获取 legacy oapi token（用于媒体上传）。失败时返回 null（调用方应降级）。
 *
 * 上游 connector 失败时返回 null；本仓库沿用此语义：失败 → 不上传媒体。
 */
export async function getOapiAccessToken(creds: ResolvedDingtalkCredentials): Promise<string | null> {
  const key = cacheKey(creds, 'oapi')
  const cached = tokenCache.get(key)
  const now = Date.now()

  if (cached?.token && cached.expiresAt - REFRESH_BUFFER_MS > now) {
    return cached.token
  }
  if (cached?.inflight) return cached.inflight

  const promise = (async () => {
    try {
      const http = getDingtalkHttpClient({ baseURL: DINGTALK_OAPI })
      const res = await http.get<{ accessToken: string; expireIn: number }>(
        '/gettoken',
        { params: { appkey: creds.clientId, appsecret: creds.clientSecret } },
      )
      const token = res.data.accessToken
      const expiresAt = Date.now() + res.data.expireIn * 1000
      tokenCache.set(key, { token, expiresAt: Math.min(expiresAt, Date.now() + ACCESS_TOKEN_EXPIRE_MS) })
      log.debug('oapi access token refreshed', { clientId: creds.clientId })
      return token
    } catch (err) {
      log.error('failed to get oapi access token', err)
      tokenCache.delete(key)
      return null
    } finally {
      const cur = tokenCache.get(key)
      if (cur?.inflight) tokenCache.set(key, { token: cur.token, expiresAt: cur.expiresAt })
    }
  })()

  tokenCache.set(key, { ...(cached ?? { token: '', expiresAt: 0 }), inflight: promise })
  return promise
}

/**
 * 给一个 axios 实例注入最新 token 到 header。
 * 调用方负责传入 http 实例（避免循环依赖）。
 */
export async function withTokenHeader(
  http: AxiosInstance,
  creds: ResolvedDingtalkCredentials,
  useOapi = false,
): Promise<AxiosInstance> {
  const token = useOapi ? await getOapiAccessToken(creds) : await getAccessToken(creds)
  if (token) {
    http.defaults.headers.common['x-acs-dingtalk-access-token'] = token
  }
  return http
}

/**
 * 清空所有缓存（测试用 / 配置变更时用）。
 */
export function clearTokenCache(): void {
  tokenCache.clear()
}

// =============================================================================
// Proactive token refresh scheduler
// =============================================================================

let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动 token 主动续期定时器。
 *
 * 钉钉 token 有效期 2h。我们在到期前 10min 主动刷新一次，
 * 确保 token 不会在 AI Card 流式发送、长任务处理等中间过期。
 *
 * 不需要调用方 await —— 在后台运行。
 * 调用方只需在 `apply()` 里调用一次，或在新账号 credentials 变更时调用。
 *
 * @param creds 凭证（新账号凭证变更时重新调用以替换）
 * @param intervalMinutes 刷新间隔，默认 50min（2h 内至少刷新 2 次）
 */
export function startTokenRefreshScheduler(
  creds: ResolvedDingtalkCredentials,
  intervalMinutes: number = 50,
): () => void {
  stopTokenRefreshScheduler()

  const intervalMs = intervalMinutes * 60 * 1000
  tokenRefreshTimer = setInterval(async () => {
    try {
      const token = await getAccessToken(creds)
      log.debug('proactive token refresh successful')
      void token // 忽略返回值，只确保缓存被刷新
      // 同时刷新 oapi token
      try {
        await getOapiAccessToken(creds)
      } catch {
        log.warn('oapi token refresh failed (non-fatal)')
      }
    } catch (err) {
      log.warn('proactive token refresh failed', err)
    }
  }, intervalMs)

  log.info(`token refresh scheduler started (interval=${intervalMinutes}min)`)
  return stopTokenRefreshScheduler
}

/**
 * 停止 token 续期定时器。
 */
export function stopTokenRefreshScheduler(): void {
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer)
    tokenRefreshTimer = null
  }
}