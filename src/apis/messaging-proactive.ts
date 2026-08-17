/**
 * Proactive send — 主动发送消息（带 AI Card 优先 + 普通消息降级 + 媒体后处理）
 *
 * Fork 自上游 connector 的 services/messaging.ts 中 sendToUser / sendToGroup /
 * sendProactive / sendNormalToUser / sendNormalToGroup / sendAICardInternal。
 *
 * 简化：
 *   - 去掉 mentions.ts 的多机器人协作（本仓库首版只支持单机器人）
 *   - 把"先创建 AI Card 再 stream 再 finish"的标准模式封装到 sendProactive
 *   - 媒体后处理走 processLocalImages（markdown 图片路径 → media download URL）
 */

import type { ResolvedDingtalkCredentials } from '../types.js'
import { DINGTALK_API } from './messaging-types.js'
import {
  MEDIA_MSG_TYPES,
  type AICardTarget,
  type DingTalkMsgType,
  type MessagingCallOptions,
  type ProactiveSendOptions,
  type SendResult,
} from './messaging-types.js'
import { getAccessToken } from './tokens.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { createLogger } from '../utils/logger.js'
import {
  createAICardForTarget,
  finishAICard,
} from './messaging-ai-card.js'
import { processLocalImages } from './media.js'
import {
  processVideoMarkers,
  processAudioMarkers,
  processFileMarkers,
} from './media-markers.js'

const log = createLogger('dingtalk-proactive')

// =============================================================================
// 普通消息发送（单聊 / 群聊）
// =============================================================================

async function sendNormalInternal(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  content: string,
  options: ProactiveSendOptions,
): Promise<SendResult> {
  const { msgType = 'text', title } = options

  // 后处理：本地图片 → media URL
  let processedContent = content
  const { getOapiAccessToken } = await import('./tokens.js')
  const oapiToken = await getOapiAccessToken(creds)
  if (oapiToken) {
    processedContent = await processLocalImages(content, oapiToken, log)
  }

  const { buildMsgPayload } = await import('./messaging-send.js')
  const payload = buildMsgPayload(
    msgType,
    processedContent,
    title,
    {
      atDingtalkIds: options.atDingtalkIds,
      atUserIds: options.atUserIds,
      atAll: options.atAll,
    },
  )
  if ('error' in payload) {
    return { ok: false, error: payload.error, usedAICard: false }
  }

  try {
    const token = await getAccessToken(creds)
    const isUser = target.type === 'user'
    const endpoint = isUser
      ? '/v1.0/robot/oToMessages/batchSend'
      : '/v1.0/robot/groupMessages/send'

    const body: Record<string, unknown> = {
      robotCode: String(creds.clientId),
      msgKey: payload.msgKey,
      msgParam: JSON.stringify(payload.msgParam),
    }
    if (isUser) {
      body.userIds = [target.userId]
    } else {
      body.openConversationId = target.openConversationId
    }

    const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
    const resp = await http.post(endpoint, body, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    })

    if (resp.data?.processQueryKey) {
      return { ok: true, processQueryKey: resp.data.processQueryKey, usedAICard: false }
    }
    return {
      ok: false,
      error: resp.data?.message ?? 'unknown',
      usedAICard: false,
    }
  } catch (err) {
    const e = err as { response?: { data?: { message?: string } }; message?: string }
    return {
      ok: false,
      error: e.response?.data?.message ?? e.message ?? 'unknown',
      usedAICard: false,
    }
  }
}

// =============================================================================
// AI Card 发送（含媒体后处理 + 流式占位：先 create → finish）
//   本仓库首版用 create → finish 两步式（无中间流式 chunk）。
//   流式 chunk 在 stream.ts 里的 bridge 已经覆盖（每个 chunk 走 aiCard.appendAiCardChunk）。
// =============================================================================

async function sendAICardInternal(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  content: string,
  options: MessagingCallOptions = {},
): Promise<SendResult> {
  const targetDesc =
    target.type === 'group'
      ? `群聊 ${target.openConversationId}`
      : `用户 ${target.userId}`

  try {
    // 0. oapiToken 用于后处理图片
    const { getOapiAccessToken } = await import('./tokens.js')
    const oapiToken = await getOapiAccessToken(creds)

    // 1. 图片后处理
    let processedContent = content
    if (oapiToken) {
      processedContent = await processLocalImages(content, oapiToken, log)
    }

    // 2. 视频/音频/文件标记 —— 每个标记触发独立消息（上传 + 发送）
    const markerOpts = { creds, target, maxBytes: 20 * 1024 * 1024 }
    processedContent = await processVideoMarkers(processedContent, markerOpts)
    processedContent = await processAudioMarkers(processedContent, markerOpts)
    processedContent = await processFileMarkers(processedContent, markerOpts)

    // 3. 创建 + 完成 AI Card
    const card = await createAICardForTarget(creds, target, options)
    if (!card) {
      return { ok: false, error: 'failed to create AI Card', usedAICard: false }
    }
    await finishAICard(card, processedContent, creds, options)

    log.debug(`[AICard] sent to ${targetDesc}, cardInstanceId=${card.cardInstanceId}`)
    return { ok: true, cardInstanceId: card.cardInstanceId, usedAICard: true }
  } catch (err) {
    log.error(`[AICard] send failed (${targetDesc}): ${(err as Error).message}`)
    return {
      ok: false,
      error: (err as Error).message,
      usedAICard: false,
    }
  }
}

// =============================================================================
// 主动发送主入口
// =============================================================================

/**
 * 智能发送：默认走 AI Card；非文本消息 / AI Card 失败时降级到普通消息。
 */
export async function sendProactive(
  creds: ResolvedDingtalkCredentials,
  target:
    | { userId?: string; userIds?: string[]; openConversationId?: string },
  content: string,
  options: ProactiveSendOptions = {},
): Promise<SendResult> {
  if (!options.msgType) {
    const hasMarkdown =
      /^[#*>-]|[*_`#\[\]]/.test(content) ||
      (typeof content === 'string' && content.includes('\n'))
    if (hasMarkdown) options.msgType = 'markdown'
  }

  const {
    msgType = 'text',
    useAICard = true,
    fallbackToNormal = true,
  } = options

  if (target.openConversationId) {
    return sendProactiveInternal(
      creds,
      { type: 'group', openConversationId: target.openConversationId },
      content,
      { ...options, msgType, useAICard, fallbackToNormal },
    )
  }
  const userIds = target.userIds ?? (target.userId ? [target.userId] : [])
  if (userIds.length === 0) {
    return {
      ok: false,
      error: 'must specify userId, userIds, or openConversationId',
      usedAICard: false,
    }
  }
  // 多用户：走普通消息批量发送
  if (userIds.length > 1) {
    return sendNormalInternal(
      creds,
      { type: 'user', userId: userIds[0] },
      content,
      { ...options, msgType, useAICard: false },
    )
  }
  return sendProactiveInternal(
    creds,
    { type: 'user', userId: userIds[0] },
    content,
    { ...options, msgType, useAICard, fallbackToNormal },
  )
}

async function sendProactiveInternal(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  content: string,
  options: ProactiveSendOptions,
): Promise<SendResult> {
  const isMedia = MEDIA_MSG_TYPES.has(options.msgType as DingTalkMsgType)
  if (options.useAICard && !isMedia) {
    try {
      const card = await sendAICardInternal(creds, target, content, {
        log,
      })
      if (card.ok) return card
      if (!options.fallbackToNormal) return card
    } catch (err) {
      if (!options.fallbackToNormal) {
        return { ok: false, error: (err as Error).message, usedAICard: false }
      }
    }
  }
  return sendNormalInternal(creds, target, content, options)
}

// =============================================================================
// 单聊 / 群聊顶层 API
// =============================================================================

export async function sendToUser(
  creds: ResolvedDingtalkCredentials,
  userId: string | string[],
  text: string,
  options: ProactiveSendOptions = {},
): Promise<SendResult> {
  if (!creds?.clientId || !creds?.clientSecret) {
    return { ok: false, error: 'missing clientId or clientSecret', usedAICard: false }
  }
  if (!userId || (Array.isArray(userId) && userId.length === 0)) {
    return { ok: false, error: 'userId is empty', usedAICard: false }
  }
  if (Array.isArray(userId)) {
    return sendProactive(creds, { userIds: userId }, text, options)
  }
  return sendProactive(creds, { userId }, text, options)
}

export async function sendToGroup(
  creds: ResolvedDingtalkCredentials,
  openConversationId: string,
  text: string,
  options: ProactiveSendOptions = {},
): Promise<SendResult> {
  if (!creds?.clientId || !creds?.clientSecret) {
    return { ok: false, error: 'missing clientId or clientSecret', usedAICard: false }
  }
  if (!openConversationId) {
    return { ok: false, error: 'openConversationId is empty', usedAICard: false }
  }
  return sendProactive(creds, { openConversationId }, text, options)
}