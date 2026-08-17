/**
 * AI Card Bridge — DSH runtime 层：把 agent 的流式输出写回钉钉 AI Card.
 *
 * PR-3 重构：
 *   - createAiCard: 用完整 apis/createAICardForTarget（两步：create + deliver），
 *     把真实的 AICardInstance 缓存到 cardRealCache，供后续 stream/finish 复用。
 *   - appendAiCardChunk: 用完整 apis/streamAICard（QPS 限流 + Markdown 修正 + token 自动续期）
 *   - completeAiCard: 用完整 apis/finishAICard（FINISHED 状态切换 + 退避重试）
 *   - failAiCard: 走 finishAICard + 错误文本
 *
 * 与 apis/ 的对应关系：
 *   apis/messaging-ai-card.ts        ← 协议层（QPS / Markdown / token）
 *   runtime/ai-card.ts (本文件)      ← DSH runtime 层（缓存 + bridge 状态）
 */

import type { BridgeContext, AiCardInstance, DingtalkInboundMessage } from '../types.js'
import {
  createAICardForTarget,
  streamAICard as apisStreamAICard,
  finishAICard as apisFinishAICard,
  type AICardInstance as ApisAICardInstance,
} from '../apis/messaging.js'

const CARD_REUSE_MS_DEFAULT = 86_400_000

/**
 * 创建一张 AI Card 并设为"思考中"状态。
 * 复用窗口内：复用上次 cardInstanceId；否则创建新卡。
 *
 * 成功时把真实的 AICardInstance（含 token / expire / inputingStarted）写入
 * bctx.cardRealCache，供后续 streamAICard / finishAICard 复用。
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

  const target =
    msg.conversationType === '2'
      ? { type: 'group' as const, openConversationId: msg.conversationId }
      : { type: 'user' as const, userId: msg.senderStaffId ?? msg.conversationId }

  const realCard: ApisAICardInstance | null = await createAICardForTarget(bctx.credentials, target)
  if (realCard) {
    instance.cardInstanceId = realCard.cardInstanceId
    bctx.cardRealCache?.set(cardKey, realCard)
  }

  bctx.cardCache.set(sessionId, instance)
  return instance
}

/**
 * 推流式 chunk 给 AI Card.
 * 首次调用会触发 INPUTING 状态切换（apis/messaging-ai-card 内部处理）。
 */
export async function appendAiCardChunk(
  bctx: BridgeContext,
  card: AiCardInstance,
  delta: string,
): Promise<void> {
  card.status = 'streaming'
  if (!card.cardInstanceId || !bctx.cardRealCache) return
  const realCard = bctx.cardRealCache.get(card.cardKey)
  if (!realCard) return
  await apisStreamAICard(realCard, delta, false, bctx.credentials)
}

/**
 * 标记 AI Card 完成。
 * apis/finishAICard 会触发 INPUTING 切换 + 推送 final chunk + FINISHED 状态。
 */
export async function completeAiCard(
  bctx: BridgeContext,
  card: AiCardInstance,
  content: unknown,
): Promise<void> {
  card.status = 'done'
  if (!card.cardInstanceId || !bctx.cardRealCache) return
  const realCard = bctx.cardRealCache.get(card.cardKey)
  if (!realCard) return
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  await apisFinishAICard(realCard, text, bctx.credentials)
}

/**
 * 标记 AI Card 失败（走 finishAICard + 错误文本）。
 */
export async function failAiCard(
  bctx: BridgeContext,
  card: AiCardInstance,
  reason: string,
): Promise<void> {
  card.status = 'failed'
  if (!card.cardInstanceId || !bctx.cardRealCache) return
  const realCard = bctx.cardRealCache.get(card.cardKey)
  if (!realCard) return
  await apisFinishAICard(realCard, `⚠️ **执行失败**\n\n\n${reason}`, bctx.credentials)
}