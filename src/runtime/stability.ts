/**
 * Stream connection stability — heartbeat + exponential backoff reconnect
 * + message dedup + AI-task grace period.
 *
 * Fork 自上游 connector 的 core/connection.ts:200-797。
 * 剥离 OpenClaw 依赖（`ClawdbotConfig` / `RuntimeEnv`），改用 DSH 原生类型。
 *
 * 架构：
 *   - `StreamConnection` 封装 `DWClient`（from dingtalk-stream SDK）
 *   - 禁用 SDK 内置 keepAlive / autoReconnect，用自定义实现
 *   - 10s 心跳 ping → 20s 超时 → 触发重连
 *   - 指数退避：BASE_BACKOFF_DELAY * 2^attempt + jitter，cap at MAX_BACKOFF_DELAY
 *   - WebSocket close / disconnect topic → 立即重连
 *   - 消息处理期间每 15s 刷新 `lastSocketAvailableTime`（防止 AI 长任务误触发）
 *   - 消息去重：5min TTL，双层（protocol headers.messageId + business data.msgId）
 *
 * 上游常量（connection.ts:58-65）：
 *   HEARTBEAT_INTERVAL = 10s
 *   TIMEOUT_THRESHOLD  = 20s
 *   BASE_BACKOFF_DELAY = 1s
 *   MAX_BACKOFF_DELAY  = 30s
 *
 * 暴露给 stream.ts：
 *   - `StreamConnection.create(creds, accountId, opts)`
 *   - `conn.onMessage(handler)`
 *   - `conn.start()`
 *   - `conn.stop()`
 *   - `conn.connected` / `conn.stats`
 */

import { createLogger } from '../utils/logger.js'
import type { ResolvedDingtalkCredentials } from '../types.js'

const log = createLogger('dingtalk-stability')

// =============================================================================
// Constants
// =============================================================================

/** 心跳间隔（毫秒） */
const HEARTBEAT_INTERVAL = 10 * 1000
/** 超时阈值（毫秒）：2 次心跳未响应 → 触发重连 */
const TIMEOUT_THRESHOLD = 20 * 1000
/** 基础退避时间（毫秒） */
const BASE_BACKOFF_DELAY = 1000
/** 最大退避时间（毫秒） */
const MAX_BACKOFF_DELAY = 30 * 1000
/** 消息去重 TTL（毫秒） */
const MESSAGE_DEDUP_TTL = 5 * 60 * 1000
/** 消息处理活跃标记刷新间隔（毫秒） */
const PROCESSING_KEEPALIVE_INTERVAL = 15 * 1000

// =============================================================================
// Exponential backoff with jitter
// =============================================================================

export function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_DELAY * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 // 0-1s jitter
  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_DELAY)
}

// =============================================================================
// Message dedup
// =============================================================================

interface DedupEntry {
  seenAt: number
}

const messageDedupCache = new Map<string, DedupEntry>()

/**
 * 检查并标记消息是否重复。返回 true = 重复（应跳过）。
 *
 * 双层去重：
 *   1. protocol layer: headers.messageId（同一投递的重复回调）
 *   2. business layer: data.msgId（钉钉服务端重发，headers 变但 data 不变）
 */
export function checkAndMarkMessage(
  accountId: string,
  protocolMessageId: string | undefined,
  businessMessageId: string | undefined,
): boolean {
  // 定期清理过期条目（每次调用时触发 1% 概率，避免 GC 开销）
  if (Math.random() < 0.01) {
    cleanupDedup()
  }

  if (protocolMessageId) {
    const key = `${accountId}:protocol:${protocolMessageId}`
    if (messageDedupCache.has(key)) return true
    messageDedupCache.set(key, { seenAt: Date.now() })
  }

  if (businessMessageId) {
    const key = `${accountId}:business:${businessMessageId}`
    if (messageDedupCache.has(key)) return true
    messageDedupCache.set(key, { seenAt: Date.now() })
  }

  return false
}

function cleanupDedup(): void {
  const now = Date.now()
  for (const [key, entry] of messageDedupCache.entries()) {
    if (now - entry.seenAt > MESSAGE_DEDUP_TTL) {
      messageDedupCache.delete(key)
    }
  }
}

// =============================================================================
// StreamConnection — wraps DWClient with stability logic
// =============================================================================

export type StreamMessageHandler = (res: { headers?: Record<string, unknown>; data: string; messageId?: string }) => Promise<void> | void

export type StreamConnectionOptions = {
  /** 是否启用自定义 keepAlive（默认 true） */
  enableKeepAlive?: boolean
  /** ping 间隔 ms（默认 HEARTBEAT_INTERVAL） */
  heartbeatInterval?: number
  /** 超时阈值 ms（默认 TIMEOUT_THRESHOLD） */
  timeoutThreshold?: number
}

interface DWClientInstance {
  socket?: {
    readyState: number
    ping: () => void
    on: (event: string, handler: (...args: unknown[]) => void) => void
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void
    removeAllListeners: () => void
    once: (event: string, handler: (...args: unknown[]) => void) => void
  }
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  registerCallbackListener: (path: string, handler: (res: unknown) => void) => void
  socketCallBackResponse: (messageId: string, response: unknown) => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
  close: () => void
}

export class StreamConnection {
  readonly accountId: string
  readonly credentials: ResolvedDingtalkCredentials
  private client: DWClientInstance | null = null
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private processingKeepAliveTimer: ReturnType<typeof setInterval> | null = null
  private statsInterval: ReturnType<typeof setInterval> | null = null

  private lastSocketAvailableTime = Date.now()
  private connectionEstablishedTime = Date.now()
  private isReconnecting = false
  private reconnectAttempts = 0
  private isStopped = false
  private activeMessageProcessing = false

  private messageHandler: StreamMessageHandler | null = null
  private onStatusChange: ((patch: Record<string, unknown>) => void) | null = null

  private readonly heartbeatInterval: number
  private readonly timeoutThreshold: number

  // 消息统计
  private receivedCount = 0
  private processedCount = 0
  private lastMessageTime = Date.now()

  private constructor(creds: ResolvedDingtalkCredentials, accountId: string, opts: StreamConnectionOptions = {}) {
    this.credentials = creds
    this.accountId = accountId
    this.heartbeatInterval = opts.heartbeatInterval ?? HEARTBEAT_INTERVAL
    this.timeoutThreshold = opts.timeoutThreshold ?? TIMEOUT_THRESHOLD
  }

  static async create(
    creds: ResolvedDingtalkCredentials,
    accountId: string,
    opts: StreamConnectionOptions = {},
  ): Promise<StreamConnection> {
    const conn = new StreamConnection(creds, accountId, opts)
    await conn.initClient()
    return conn
  }

  private async initClient(): Promise<void> {
    // Dynamic import to avoid startup hard-dependency
    const stream = await import('dingtalk-stream')
    const DWClient = stream.DWClient ?? stream.default?.DWClient
    if (!DWClient) throw new Error('dingtalk-stream SDK missing DWClient')

    this.client = new DWClient({
      clientId: this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
      autoReconnect: false,   // we handle reconnect ourselves
      keepAlive: false,       // we handle keepAlive ourselves
    }) as DWClientInstance
  }

  /**
   * Register the message callback (same API as upstream's
   * `client.registerCallbackListener('/v1.0/im/bot/messages/get', handler)`).
   */
  onMessage(handler: StreamMessageHandler): void {
    this.messageHandler = handler
    if (this.client) {
      this.client.registerCallbackListener('/v1.0/im/bot/messages/get', (res: unknown) => {
        this.handleInbound(res)
      })
    }
  }

  /**
   * Register status-change callback for UI (connected / lastInboundAt).
   */
  onStatus(callback: (patch: Record<string, unknown>) => void): void {
    this.onStatusChange = callback
  }

  /**
   * Start the connection + keepAlive loop.
   * Returns a disposer.
   */
  async start(): Promise<() => void> {
    if (!this.client) throw new Error('StreamConnection not initialized')

    // Register SDK event listeners for logging
    this.client.on('error', (err: Error) => {
      log.error(`[${this.accountId}] connection error: ${err.message}`)
    })
    this.client.on('reconnect', () => {
      log.info(`[${this.accountId}] SDK reconnecting...`)
    })
    this.client.on('reconnected', () => {
      log.info(`[${this.accountId}] SDK reconnected successfully`)
    })

    await this.client.connect()
    this.setupPongListener()
    this.setupCloseListener()
    this.setupDisconnectTopicListener()
    this.startKeepAlive()

    log.info(`[${this.accountId}] connected to DingTalk Stream`)

    // Clean up on process exit
    const cleanup = () => {
      this.stop()
    }
    process.once('exit', cleanup)
    process.once('SIGINT', cleanup)
    process.once('SIGTERM', cleanup)

    return () => {
      this.stop()
      process.removeListener('exit', cleanup)
      process.removeListener('SIGINT', cleanup)
      process.removeListener('SIGTERM', cleanup)
    }
  }

  /**
   * Stop everything: timers, socket listeners, connection.
   */
  stop(): void {
    this.isStopped = true
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer)
    this.keepAliveTimer = null
    if (this.processingKeepAliveTimer) clearInterval(this.processingKeepAliveTimer)
    this.processingKeepAliveTimer = null
    if (this.statsInterval) clearInterval(this.statsInterval)
    this.statsInterval = null
    if (this.client?.socket) this.client.socket.removeAllListeners()
    try { this.client?.close?.() } catch { /* ignore */ }
  }

  get connected(): boolean {
    return this.client?.socket?.readyState === 1
  }

  get stats() {
    return {
      accountId: this.accountId,
      connected: this.connected,
      received: this.receivedCount,
      processed: this.processedCount,
      dropped: this.receivedCount - this.processedCount,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageTime: this.lastMessageTime,
    }
  }

  // =========================================================================
  // Internal: heartbeat & reconnect
  // =========================================================================

  private markProcessingStart(): void {
    this.activeMessageProcessing = true
    this.lastSocketAvailableTime = Date.now()
    if (this.processingKeepAliveTimer) clearInterval(this.processingKeepAliveTimer)
    this.processingKeepAliveTimer = setInterval(() => {
      if (this.activeMessageProcessing) {
        this.lastSocketAvailableTime = Date.now()
        log.debug(`[${this.accountId}] AI task keepalive refresh`)
      }
    }, PROCESSING_KEEPALIVE_INTERVAL)
  }

  private markProcessingEnd(): void {
    this.activeMessageProcessing = false
    if (this.processingKeepAliveTimer) clearInterval(this.processingKeepAliveTimer)
    this.processingKeepAliveTimer = null
    this.lastSocketAvailableTime = Date.now()
  }

  private startKeepAlive(): void {
    this.keepAliveTimer = setInterval(async () => {
      if (this.isStopped) return
      try {
        const elapsed = Date.now() - this.lastSocketAvailableTime
        if (elapsed > this.timeoutThreshold) {
          log.info(`[${this.accountId}] timeout: ${Math.round(elapsed / 1000)}s since last pong, reconnecting`)
          await this.doReconnect()
          return
        }
        const socketState = this.client?.socket?.readyState
        const timeSinceConnection = Date.now() - this.connectionEstablishedTime
        if (socketState !== 1) {
          // Grace period for newly established connections
          if (timeSinceConnection < 15_000) {
            log.debug(`[${this.accountId}] connecting (grace period), skipping status check`)
            return
          }
          log.info(`[${this.accountId}] socket state=${socketState}, reconnecting immediately`)
          await this.doReconnect(true)
          return
        }
        // Send native WebSocket ping
        try {
          this.client?.socket?.ping()
        } catch (err) {
          log.warn(`[${this.accountId}] ping failed: ${(err as Error).message}`)
        }
      } catch (err) {
        log.error(`[${this.accountId}] keepAlive error: ${(err as Error).message}`)
      }
    }, this.heartbeatInterval)
  }

  private setupPongListener(): void {
    this.client?.socket?.on('pong', () => {
      this.lastSocketAvailableTime = Date.now()
      log.debug(`[${this.accountId}] pong received`)
    })
  }

  private setupCloseListener(): void {
    this.client?.socket?.on('close', (code: number, reason: string) => {
      log.info(`[${this.accountId}] WebSocket close: code=${code}, reason=${reason || 'unknown'}, isStopped=${this.isStopped}`)
      this.onStatusChange?.({ connected: false })
      if (this.isStopped) return
      // Immediate reconnect on close (no backoff)
      setTimeout(() => {
        this.doReconnect(true).catch((err) => {
          log.error(`[${this.accountId}] reconnect failed: ${err.message}`)
        })
      }, 0)
    })
  }

  /**
   * 钉钉服务端在 LB / 实例切换时下发 disconnect topic，
   * 客户端需立即断开重连（不退避）。
   */
  private setupDisconnectTopicListener(): void {
    this.client?.socket?.on('message', (data: unknown) => {
      try {
        const msg = JSON.parse(String(data))
        if (msg.type === 'SYSTEM' && msg.headers?.topic === 'disconnect') {
          log.info(`[${this.accountId}] received server disconnect topic, reconnecting immediately`)
          if (!this.isStopped && !this.isReconnecting) {
            this.doReconnect(true).catch((err) => {
              log.error(`[${this.accountId}] reconnect failed: ${err.message}`)
            })
          }
        }
      } catch {
        /* parse error — ignore */
      }
    })
  }

  private async doReconnect(immediate = false): Promise<void> {
    if (this.isReconnecting || this.isStopped) return
    this.isReconnecting = true

    // Exponential backoff (not for immediate reconnects)
    if (!immediate && this.reconnectAttempts > 0) {
      const delay = calculateBackoffDelay(this.reconnectAttempts)
      log.info(`[${this.accountId}] waiting ${Math.round(delay / 1000)}s before reconnect (attempt ${this.reconnectAttempts + 1})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    try {
      // 1. Disconnect old connection
      if (this.client?.socket?.readyState === 1 || this.client?.socket?.readyState === 3) {
        try {
          await this.client.disconnect()
          log.info(`[${this.accountId}] disconnected old connection`)
        } catch {
          /* disconnect failure is ok */
        }
      }

      // 2. Re-establish connection
      await this.client!.connect()

      // 3. Re-register listeners immediately
      this.setupPongListener()
      this.setupCloseListener()
      this.setupDisconnectTopicListener()

      // 4. Wait for connection to actually open (max 10s)
      const established = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10_000)
        if (this.client?.socket?.readyState === 1) {
          clearTimeout(timeout)
          resolve(true)
          return
        }
        const onOpen = () => {
          clearTimeout(timeout)
          this.client?.socket?.removeListener('open', onOpen)
          this.client?.socket?.removeListener('error', onError)
          resolve(true)
        }
        const onError = () => {
          clearTimeout(timeout)
          this.client?.socket?.removeListener('open', onOpen)
          this.client?.socket?.removeListener('error', onError)
          resolve(false)
        }
        this.client?.socket?.once('open', onOpen)
        this.client?.socket?.once('error', onError)
      })

      if (!established) throw new Error('connection establishment timeout')

      this.lastSocketAvailableTime = Date.now()
      this.connectionEstablishedTime = Date.now()
      this.reconnectAttempts = 0
      this.onStatusChange?.({ connected: true, lastConnectedAt: Date.now() })
      log.info(`[${this.accountId}] reconnect successful (socket state=${this.client?.socket?.readyState})`)
    } catch (err) {
      this.reconnectAttempts++
      log.error(`[${this.accountId}] reconnect failed: ${(err as Error).message} (attempt ${this.reconnectAttempts})`)
      throw err
    } finally {
      this.isReconnecting = false
    }
  }

  // =========================================================================
  // Internal: inbound message handler
  // =========================================================================

  private handleInbound(res: unknown): void {
    const r = res as { headers?: Record<string, unknown>; data: string }
    this.receivedCount++
    this.lastMessageTime = Date.now()

    const messageId = (r.headers?.['messageId'] ?? r.headers?.['messageId']) as string | undefined

    // Confirm callback immediately (dingtalk-stream protocol)
    if (messageId && this.client) {
      try {
        this.client.socketCallBackResponse(messageId, { success: true })
      } catch {
        /* ignore */
      }
    }

    // Protocol-layer dedup
    if (messageId && checkAndMarkMessage(this.accountId, messageId, undefined)) {
      this.processedCount++
      log.debug(`[${this.accountId}] duplicate protocol message, skipped: ${messageId}`)
      return
    }

    // Parse data
    let data: Record<string, unknown>
    try {
      data = JSON.parse(r.data) as Record<string, unknown>
    } catch {
      this.processedCount++
      log.error(`[${this.accountId}] failed to parse message data`)
      return
    }

    // Business-layer dedup
    const businessMsgId = data['msgId'] as string | undefined
    if (businessMsgId && checkAndMarkMessage(this.accountId, undefined, businessMsgId)) {
      this.processedCount++
      log.debug(`[${this.accountId}] duplicate business message, skipped: ${businessMsgId}`)
      return
    }

    // Mark processing start (prevents keepAlive timeout during AI tasks)
    this.markProcessingStart()

    // Async forward to registered handler
    Promise.resolve()
      .then(() => this.messageHandler?.({ headers: r.headers, data: r.data, messageId }))
      .catch((err) => {
        log.error(`[${this.accountId}] message handler error: ${(err as Error).message}`)
      })
      .finally(() => {
        this.processedCount++
        this.markProcessingEnd()
      })
  }
}
