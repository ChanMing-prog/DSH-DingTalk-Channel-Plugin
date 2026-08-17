/**
 * AI Card Bridge — 把 DSH agent 的流式输出写回钉钉 AI Card
 *
 * 协议层直接 fork 自上游 connector 的 services/card-bridge.ts；
 * OpenClaw 桥接（gateway method + OpenClaw streaming）部分被替换成：
 *   - 通过 dingtalk-stream 的 CardReplier 注册回调
 *   - 通过 API /v1.0/card/instances 推送流式更新
 *
 * 首版只实现 create + append（chunk）+ complete + fail 四个动作。
 * 复杂功能（按钮回调、tool-call 渲染）后续 PR 补充。
 */

import type { AxiosInstance } from 'axios'
import type { BridgeContext, AiCardInstance, DingtalkInboundMessage } from '../types.js'
import { createLogger } from '../utils/logger.js'
import { getAccessToken } from './setup.js'

const log = createLogger('dingtalk-ai-card')

const CARD_REUSE_MS_DEFAULT = 86_400_000

async function http(bctx: BridgeContext): Promise<AxiosInstance> {
  const { getDingtalkHttpClient } = await import('../utils/http-client.js')
  const client = getDingtalkHttpClient()
  // 注入最新 accessToken
  const token = await getAccessToken(bctx.credentials)
  client.defaults.headers.common['x-acs-dingtalk-access-token'] = token
  return client
}

/**
 * 创建一张 AI Card 并设为"思考中"状态。
 * 复用窗口内：复用上次 cardInstanceId；否则创建新卡。
 */
export async function createAiCard(
  bctx: BridgeContext,
  msg: DingtalkInboundMessage,
  sessionId: string,
): Promise<AiCardInstance> {
  const reuseMs = bctx.config.aiCardReuseMs ?? CARD_REUSE_MS_DEFAULT
  const existing = bctx.cardCache.get(sessionId)
  if (existing && Date.now() - existing.createdAt < reuseMs) {
    log.debug('reusing ai card', { sessionId, cardKey: existing.cardKey })
    return existing
  }

  const cardKey = `${sessionId}:${Date.now()}`
  const instance: AiCardInstance = {
    cardKey,
    conversationId: msg.conversationId,
    createdAt: Date.now(),
    status: 'thinking',
  }

  try {
    const client = await http(bctx)
    const res = await client.post<{ cardInstanceId: string }>('/v1.0/card/instances', {
      conversationId: msg.conversationId,
      cardTemplateId: 'StandardCard',
      outTrackId: cardKey,
      cardData: {
        status: 'thinking',
        title: '正在思考…',
        content: '',
      },
    })
    instance.cardInstanceId = res.data.cardInstanceId
    log.debug('created ai card', { cardKey, cardInstanceId: instance.cardInstanceId })
  } catch (err) {
    log.error('failed to create ai card, falling back to plain text', err)
  }

  bctx.cardCache.set(sessionId, instance)
  return instance
}

/**
 * 推流式 chunk 给 AI Card。
 */
export async function appendAiCardChunk(
  bctx: BridgeContext,
  card: AiCardInstance,
  delta: string,
): Promise<void> {
  card.status = 'streaming'
  if (!card.cardInstanceId) return // fallback path：吞掉
  try {
    const client = await http(bctx)
    await client.post('/v1.0/card/instances/stream', {
      cardInstanceId: card.cardInstanceId,
      outTrackId: card.cardKey,
      cardData: {
        status: 'streaming',
        content: { delta },
      },
      isFull: false,
    })
  } catch (err) {
    log.error('appendAiCardChunk failed', err)
  }
}

/**
 * 标记 AI Card 完成。
 */
export async function completeAiCard(
  bctx: BridgeContext,
  card: AiCardInstance,
  content: unknown,
): Promise<void> {
  card.status = 'done'
  if (!card.cardInstanceId) return
  try {
    const client = await http(bctx)
    await client.post('/v1.0/card/instances/update', {
      cardInstanceId: card.cardInstanceId,
      outTrackId: card.cardKey,
      cardData: {
        status: 'done',
        content,
      },
    })
  } catch (err) {
    log.error('completeAiCard failed', err)
  }
}

/**
 * 标记 AI Card 失败。
 */
export async function failAiCard(
  bctx: BridgeContext,
  card: AiCardInstance,
  reason: string,
): Promise<void> {
  card.status = 'failed'
  if (!card.cardInstanceId) return
  try {
    const client = await http(bctx)
    await client.post('/v1.0/card/instances/update', {
      cardInstanceId: card.cardInstanceId,
      outTrackId: card.cardKey,
      cardData: {
        status: 'failed',
        content: { error: reason },
      },
    })
  } catch (err) {
    log.error('failAiCard failed', err)
  }
}