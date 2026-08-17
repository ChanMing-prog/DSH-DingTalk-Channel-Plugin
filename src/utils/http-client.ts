/**
 * HTTP client wrapper — shared axios instance for all DingTalk OpenAPI calls.
 *
 * 直接 fork 自上游 connector 的 utils/http-client.ts，并剥离 OpenClaw 引用。
 * 该模块是上游 connector 明确声明"独立隔离、不影响其他插件网络请求"的客户端。
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import https from 'node:https'
import { createLogger } from './logger.js'

const log = createLogger('dingtalk-http')

export interface DingtalkHttpClientOptions {
  baseURL?: string
  timeoutMs?: number
}

const DEFAULT_BASE = 'https://api.dingtalk.com'
const DEFAULT_TIMEOUT = 30_000

let _sharedInstance: AxiosInstance | null = null

function createInstance(baseURL: string, timeoutMs: number): AxiosInstance {
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 32,
    keepAliveMsecs: 60_000,
  })

  const inst = axios.create({
    baseURL,
    timeout: timeoutMs,
    httpsAgent: agent,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'dsh-channel-dingtalk/0.1.0',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  })

  // request 拦截：打 debug 日志
  inst.interceptors.request.use((req) => {
    log.debug('http request', {
      method: req.method?.toUpperCase(),
      url: req.url,
    })
    return req
  })

  // response 拦截：把钉钉 errcode != 0 翻译成 Error
  inst.interceptors.response.use(
    (res) => {
      const data = res.data as { errcode?: number; errmsg?: string; code?: number; message?: string } | undefined
      // 钉钉 OpenAPI 有两套错误约定：
      //   新版（topapi/v2 等）：{ errcode, errmsg, result }
      //   老版（oapi/...）：{ code, message, ... }
      const errCode = data?.errcode ?? data?.code
      const errMsg = data?.errmsg ?? data?.message
      if (typeof errCode === 'number' && errCode !== 0) {
        throw new DingtalkApiError(errCode, errMsg ?? 'unknown', res.config.url ?? '', res.data)
      }
      return res
    },
    (err) => {
      const status = err?.response?.status
      const url = err?.config?.url ?? '<unknown>'
      log.error('http error', { status, url, message: err.message })
      throw err
    },
  )

  return inst
}

export function getDingtalkHttpClient(opts: DingtalkHttpClientOptions = {}): AxiosInstance {
  if (_sharedInstance) return _sharedInstance
  const baseURL = opts.baseURL ?? DEFAULT_BASE
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  _sharedInstance = createInstance(baseURL, timeoutMs)
  return _sharedInstance
}

/**
 * 重置共享实例——测试场景或在 settings 变更 baseURL 时调用。
 */
export function resetDingtalkHttpClient(): void {
  _sharedInstance = null
}

export class DingtalkApiError extends Error {
  constructor(
    public readonly errcode: number,
    message: string,
    public readonly endpoint: string,
    public readonly rawResponse?: unknown,
  ) {
    super(`[dingtalk errcode=${errcode}] ${endpoint}: ${message}`)
    this.name = 'DingtalkApiError'
  }
}

/** Re-export 常用 axios 类型 */
export type { AxiosInstance, AxiosRequestConfig }