/**
 * AI Card Bridge — 创建/流式更新/完成 AI Card
 *
 * Fork 自上游 connector 的 services/messaging/card.ts。
 * 主要变更：
 *   - DingtalkConfig 形态 → ResolvedDingtalkCredentials
 *   - 把 createLoggerFromConfig(cfg, name) → 上游的"从 config 派生 logger"
 *     改为显式 log 参数
 *   - 限流器逻辑、QPS 退避、Markdown 修正全部保留（这是上游打磨出来的核心）
 *
 * 钉钉 API 端点（newAPI）：
 *   POST   /v1.0/card/instances        创建卡片实例
 *   POST   /v1.0/card/instances/deliver 投放卡片到目标
 *   PUT    /v1.0/card/instances        更新卡片状态（如 FINISHED）
 *   PUT    /v1.0/card/streaming        流式增量更新
 *
 * 官方 QPS 限制：约 40 次/秒；保守取 20，留余量。
 */

import type { ResolvedDingtalkCredentials } from '../types.js'
import { createLogger } from '../utils/logger.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { getAccessToken } from './tokens.js'
import {
  AI_CARD_STATUS,
  AI_CARD_TEMPLATE_ID,
  DINGTALK_API,
  type AICardInstance,
  type AICardTarget,
  type MessagingCallOptions,
} from './messaging-types.js'

// =============================================================================
// 全局令牌桶限流器
// =============================================================================

const CARD_API_MAX_QPS = 20
const QPS_BACKOFF_DURATION_MS = 2_000

const cardRateLimiter = {
  tokens: CARD_API_MAX_QPS,
  lastRefillTime: Date.now(),
  backoffUntil: 0,
  _queueTail: Promise.resolve() as Promise<unknown>,

  refill(): void {
    const now = Date.now()
    const elapsedSeconds = (now - this.lastRefillTime) / 1000
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(
        CARD_API_MAX_QPS,
        this.tokens + elapsedSeconds * CARD_API_MAX_QPS,
      )
      this.lastRefillTime = now
    }
  },

  /** 串行化等待令牌（避免并发击穿）*/
  async waitForToken(): Promise<number> {
    const prev = this._queueTail
    let release!: () => void
    this._queueTail = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      await prev
    } catch {
      /* 忽略前一个的失败 */
    }
    try {
      let totalWaitMs = 0
      const now = Date.now()
      if (now < this.backoffUntil) {
        const backoffWaitMs = this.backoffUntil - now
        await sleep(backoffWaitMs)
        totalWaitMs += backoffWaitMs
      }
      this.refill()
      if (this.tokens < 1) {
        const waitMs = Math.ceil(((1 - this.tokens) / CARD_API_MAX_QPS) * 1000)
        await sleep(waitMs)
        totalWaitMs += waitMs
        this.refill()
      }
      this.tokens -= 1
      return totalWaitMs
    } finally {
      release()
    }
  },

  triggerBackoff(): void {
    const backoffEnd = Date.now() + QPS_BACKOFF_DURATION_MS
    this.backoffUntil = backoffEnd
    this.tokens = 0
    this.lastRefillTime = backoffEnd
  },
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 判定 err 是否为钉钉 QPS 限流错误。
 */
export function isQpsLimitError(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { code?: string } } } | null
  return (
    !!e?.response?.status &&
    e.response.status === 403 &&
    typeof e.response.data?.code === 'string' &&
    e.response.data.code.includes('QpsLimit')
  )
}

// =============================================================================
// Markdown 修正（钉钉 AI Card 渲染器约定）
// =============================================================================

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function ensureTableBlankLines(text: string): string {
  const lines = normalizeLineEndings(text).split('\n')
  const result: string[] = []
  const tableDividerRegex = /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/
  const tableRowRegex = /^\s*\|?.*\|.*\|?\s*$/
  const isDivider = (line: string) =>
    !!line &&
    typeof line === 'string' &&
    line.includes('|') &&
    tableDividerRegex.test(line)

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    const nextLine = lines[i + 1] ?? ''
    if (
      tableRowRegex.test(currentLine) &&
      isDivider(nextLine) &&
      i > 0 &&
      lines[i - 1].trim() !== '' &&
      !tableRowRegex.test(lines[i - 1])
    ) {
      result.push('')
    }
    result.push(currentLine)
  }
  return result.join('\n')
}

/**
 * 单个 `\n` 转 `<br>`，保留 `\n\n` 段落分隔。
 *
 * 钉钉 AI Card 渲染器的换行约定：
 *   - 普通文本：用 `<br>` 做换行
 *   - 代码块（```）：用 `\n` 做换行
 *   - 列表 / 表格 / 标题 / 引用：混合处理
 *   - 段落间距：`\n\n`
 */
export function fixNewlines(text: string): string {
  const normalized = normalizeLineEndings(text)
  const markdownBlockStartPattern =
    /^(\s{0,3}(?:[-*+]|\d+[.)])[ ])|(\s{0,3}\|)|(\s{0,3}#{1,6}\s)|(\s{0,3}(?:[-*_])\s*(?:[-*_])\s*(?:[-*_]))/
  const fencePattern = /^\s{0,3}```/
  const quotePattern = /^\s{0,3}>\s?/

  // 1. 合并连续引用行
  const mergedLines: string[] = []
  let pendingQuoteLines: string[] = []
  let inCodeBlock = false
  const flushPendingQuoteLines = () => {
    if (pendingQuoteLines.length > 0) {
      mergedLines.push(pendingQuoteLines.join('<br>'))
      pendingQuoteLines = []
    }
  }
  for (const line of normalized.split('\n')) {
    const isFence = fencePattern.test(line)
    if (inCodeBlock) {
      flushPendingQuoteLines()
      mergedLines.push(line)
      if (isFence) inCodeBlock = false
      continue
    }
    if (isFence) {
      flushPendingQuoteLines()
      mergedLines.push(line)
      inCodeBlock = true
      continue
    }
    if (quotePattern.test(line)) {
      if (pendingQuoteLines.length === 0) {
        pendingQuoteLines.push(line)
      } else {
        pendingQuoteLines.push(line.replace(quotePattern, ''))
      }
    } else {
      flushPendingQuoteLines()
      mergedLines.push(line)
    }
  }
  flushPendingQuoteLines()

  // 2. 逐行处理
  const lines = mergedLines
  inCodeBlock = false
  const parts: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    const nextInCodeBlock = fencePattern.test(currentLine) ? !inCodeBlock : inCodeBlock
    if (i < lines.length - 1) {
      const nextLine = lines[i + 1]
      const keepNewline =
        nextInCodeBlock ||
        currentLine === '' ||
        nextLine === '' ||
        fencePattern.test(nextLine) ||
        markdownBlockStartPattern.test(nextLine)
      parts.push(currentLine + (keepNewline ? '\n' : '<br>'))
    } else {
      parts.push(currentLine)
    }
    inCodeBlock = nextInCodeBlock
  }
  return parts.join('')
}

export function normalizeForCard(content: string): string {
  return fixNewlines(ensureTableBlankLines(content))
}

// =============================================================================
// 投放 body 构造
// =============================================================================

export function buildDeliverBody(
  cardInstanceId: string,
  target: AICardTarget,
  robotCode: string,
): Record<string, unknown> {
  const base = { outTrackId: cardInstanceId, userIdType: 1 }
  if (target.type === 'group') {
    return {
      ...base,
      openSpaceId: `dtv1.card//IM_GROUP.${target.openConversationId}`,
      imGroupOpenDeliverModel: { robotCode },
    }
  }
  return {
    ...base,
    openSpaceId: `dtv1.card//IM_ROBOT.${target.userId}`,
    imRobotOpenDeliverModel: {
      spaceType: 'IM_ROBOT',
      robotCode,
      extension: { dynamicSummary: 'true' },
    },
  }
}

// =============================================================================
// Token 刷新（card 长生命周期需要独立跟踪 access token）
// =============================================================================

async function ensureValidToken(card: AICardInstance, creds: ResolvedDingtalkCredentials): Promise<string> {
  if (Date.now() > card.tokenExpireTime - 5 * 60 * 1000) {
    const newToken = await getAccessToken(creds)
    card.accessToken = newToken
    card.tokenExpireTime = Date.now() + 2 * 60 * 60 * 1000
  }
  return card.accessToken
}

// =============================================================================
// 创建 AI Card
// =============================================================================

const defaultLog = createLogger('dingtalk-ai-card')

export async function createAICardForTarget(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  opts: MessagingCallOptions = {},
): Promise<AICardInstance | null> {
  const log = opts.log ?? defaultLog
  const targetDesc =
    target.type === 'group' ? `群聊 ${target.openConversationId}` : `用户 ${target.userId}`

  try {
    const token = await getAccessToken(creds)
    const cardInstanceId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    log.debug(`[AICard] create: ${targetDesc}, outTrackId=${cardInstanceId}`)

    // 1. 创建卡片实例
    const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
    await http.post(
      '/v1.0/card/instances',
      {
        cardTemplateId: AI_CARD_TEMPLATE_ID,
        outTrackId: cardInstanceId,
        cardData: {
          cardParamMap: {
            config: JSON.stringify({ autoLayout: true }),
          },
        },
        callbackType: 'STREAM',
        imGroupOpenSpaceModel: { supportForward: true },
        imRobotOpenSpaceModel: { supportForward: true },
      },
      {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
      },
    )

    // 2. 投放卡片
    const deliverBody = buildDeliverBody(cardInstanceId, target, String(creds.clientId ?? ''))
    await http.post('/v1.0/card/instances/deliver', deliverBody, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
    })

    return {
      cardInstanceId,
      accessToken: token,
      tokenExpireTime: Date.now() + 2 * 60 * 60 * 1000,
      inputingStarted: false,
    }
  } catch (err) {
    log.error(`[AICard] create failed (${targetDesc}): ${(err as Error).message}`)
    return null
  }
}

// =============================================================================
// 流式更新
// =============================================================================

export async function streamAICard(
  card: AICardInstance,
  content: string,
  finished: boolean,
  creds: ResolvedDingtalkCredentials,
  opts: MessagingCallOptions = {},
): Promise<void> {
  if (!card) return
  const log = opts.log ?? defaultLog
  await ensureValidToken(card, creds)
  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })

  // 第一次更新：切到 INPUTING 状态
  if (!card.inputingStarted) {
    const waitMs = await cardRateLimiter.waitForToken()
    if (waitMs > 0) log.debug(`[AICard] INPUTING wait ${waitMs}ms`)

    const statusBody = {
      outTrackId: card.cardInstanceId,
      cardData: {
        cardParamMap: {
          flowStatus: AI_CARD_STATUS.INPUTING,
          msgContent: normalizeForCard(content),
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
          config: JSON.stringify({ autoLayout: true }),
        },
      },
    }
    const putInputing = () =>
      http.put('/v1.0/card/instances', statusBody, {
        headers: {
          'x-acs-dingtalk-access-token': card.accessToken,
          'Content-Type': 'application/json',
        },
      })

    try {
      const resp = await putInputing()
      log.debug(`[AICard] INPUTING ok status=${resp.status}`)
    } catch (err) {
      if (isQpsLimitError(err)) {
        cardRateLimiter.triggerBackoff()
        log.warn(`[AICard] INPUTING QpsLimit; backoff ${QPS_BACKOFF_DURATION_MS}ms and retry`)
        await cardRateLimiter.waitForToken()
        try {
          await putInputing()
        } catch (retryErr) {
          log.error(`[AICard] INPUTING retry failed: ${(retryErr as Error).message}`)
          throw retryErr
        }
      } else {
        throw err
      }
    }
    card.inputingStarted = true
  }

  // 流式 chunk
  const fixedContent = normalizeForCard(content)
  const streamContent = finished ? fixedContent : fixedContent.replace(/\n+$/, '')
  const body = {
    outTrackId: card.cardInstanceId,
    guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key: 'msgContent',
    content: streamContent,
    isFull: true,
    isFinalize: finished,
    isError: false,
  }

  const waitMs = await cardRateLimiter.waitForToken()
  if (waitMs > 0) log.debug(`[AICard] streaming wait ${waitMs}ms`)

  try {
    const resp = await http.put('/v1.0/card/streaming', body, {
      headers: {
        'x-acs-dingtalk-access-token': card.accessToken,
        'Content-Type': 'application/json',
      },
    })
    log.debug(`[AICard] streaming ok status=${resp.status}, isFinalize=${finished}`)
  } catch (err) {
    if (isQpsLimitError(err)) {
      cardRateLimiter.triggerBackoff()
      log.warn(`[AICard] streaming QpsLimit; backoff ${QPS_BACKOFF_DURATION_MS}ms and retry`)
      await cardRateLimiter.waitForToken()
      try {
        body.guid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        await http.put('/v1.0/card/streaming', body, {
          headers: {
            'x-acs-dingtalk-access-token': card.accessToken,
            'Content-Type': 'application/json',
          },
        })
        return
      } catch (retryErr) {
        log.error(`[AICard] streaming retry failed: ${(retryErr as Error).message}`)
        throw retryErr
      }
    }
    throw err
  }
}

// =============================================================================
// 完成 AI Card
// =============================================================================

export async function finishAICard(
  card: AICardInstance,
  content: string,
  creds: ResolvedDingtalkCredentials,
  opts: MessagingCallOptions = {},
): Promise<void> {
  if (!card) return
  const log = opts.log ?? defaultLog
  await ensureValidToken(card, creds)
  const fixedContent = normalizeForCard(content)
  log.debug(`[AICard] finish: contentLen=${fixedContent.length}`)

  await streamAICard(card, fixedContent, true, creds, opts)

  const body = {
    outTrackId: card.cardInstanceId,
    cardData: {
      cardParamMap: {
        flowStatus: AI_CARD_STATUS.FINISHED,
        msgContent: fixedContent,
        staticMsgContent: '',
        sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
        config: JSON.stringify({ autoLayout: true }),
      },
    },
    cardUpdateOptions: { updateCardDataByKey: true },
  }

  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
  const putFinished = () =>
    http.put('/v1.0/card/instances', body, {
      headers: {
        'x-acs-dingtalk-access-token': card.accessToken,
        'Content-Type': 'application/json',
      },
    })

  try {
    await cardRateLimiter.waitForToken()
    const resp = await putFinished()
    log.debug(`[AICard] FINISHED ok status=${resp.status}`)
  } catch (err) {
    if (isQpsLimitError(err)) {
      cardRateLimiter.triggerBackoff()
      log.warn(`[AICard] FINISHED QpsLimit; backoff and retry`)
      try {
        await cardRateLimiter.waitForToken()
        await putFinished()
      } catch (retryErr) {
        log.error(`[AICard] FINISHED retry failed: ${(retryErr as Error).message}`)
      }
    } else {
      log.error(`[AICard] FINISHED failed: ${(err as Error).message}`)
    }
  }
}