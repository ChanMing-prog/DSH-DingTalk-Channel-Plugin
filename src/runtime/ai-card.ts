/**
 * AI Card Bridge — 把 DSH agent 的流式输出写回钉钉 AI Card
 *
 * PR-2 重构：本文件改为 apis/messaging-ai-card 的 thin wrapper。
 * 所有协议层逻辑（QPS 限流、Markdown 修正、token 续期）都搬到了 apis/。
 * 这里只保留"DSH 上下文管理"（conversationId → card 实例的本地缓存）。
 */

import type { BridgeContext, AiCardInstance, DingtalkInboundMessage } from '../types.js'
import {
  createAICardForTarget,
  streamAICard as apisStreamAICard,
  finishAICard as apisFinishAICard,
} from '../apis/messaging.js'

const CARD_REUSE_MS_DEFAULT = 86_400_000

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
    return existing
  }

  const cardKey = `${sessionId}:${Date.now()}`
  const instance: AiCardInstance = {
    cardKey,
    conversationId: msg.conversationId,
    createdAt: Date.now(),
    status: 'thinking',
  }

  const target = msg.conversationType === '2'
    ? { type: 'group' as const, openConversationId: msg.conversationId }
    : { type: 'user' as const, userId: msg.senderStaffId ?? msg.conversationId }

  const realCard = await createAICardForTarget(bctx.credentials, target)
  if (realCard) {
    instance.cardInstanceId = realCard.cardInstanceId
  }
  // 即便 create 失败也写入缓存：fallback 路径由 messaging 层退化为纯文本

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
  if (!card.cardInstanceId) return
  // apis/ 的 streamAICard 要求完整的 AICardInstance 形态
  const realCard = await bctx.cardRealCache?.get(card.cardKey)
  if (!realCard) return
  await apisStreamAICard(realCard, delta, false, bctx.credentials)
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
  const realCard = await bctx.cardRealCache?.get(card.cardKey)
  if (!realCard) return
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  await apisFinishAICard(realCard, text, bctx.credentials)
}

/**
 * 标记 AI Card 失败（PR-2 用 finishAICard + 错误文本实现）。
 */
export async function failAiCard(
  bctx: BridgeContext,
  card: AiCardInstance,
  reason: string,
): Promise<void> {
  card.status = 'failed'
  if (!card.cardInstanceId) return
  const realCard = await bctx.cardRealCache?.get(card.cardKey)
  if (!realCard) return
  await apisFinishAICard(realCard, `⚠️ **执行失败**\n\n${reason}`, bctx.credentials)
}