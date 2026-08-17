/**
 * Top-level messaging facade — `sendTextToDingTalk` / `sendMediaToDingTalk`
 *
 * Fork 自上游 connector 的 services/messaging.ts 顶层 API：
 *   - sendTextToDingTalk: target 字符串（"user:xxx" / "group:xxx" / cid-prefix / 裸 ID）
 *   - sendMediaToDingTalk: 同上 + mediaUrl
 *
 * 设计：
 *   - 所有导出函数都接 ResolvedDingtalkCredentials 而非 DingtalkConfig
 *   - target 字符串解析与上游保持一致（向后兼容）
 *   - sendMediaToDingTalk 内联处理文件类型判断 + 上传 + 媒体消息发送
 */

import type { ResolvedDingtalkCredentials } from '../types.js'
import {
  type MessagingCallOptions,
  type SendResult,
} from './messaging-types.js'
import { sendToGroup, sendToUser, sendProactive } from './messaging-proactive.js'
import { uploadMediaToDingTalk } from './media.js'
import { getOapiAccessToken } from './tokens.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-messaging')

// =============================================================================
// target 字符串解析
// =============================================================================

export type ParsedTarget =
  | { type: 'user'; userId: string }
  | { type: 'group'; openConversationId: string }

export function parseTargetString(target: string): ParsedTarget {
  if (target.startsWith('group:')) {
    return { type: 'group', openConversationId: target.slice(6) }
  }
  if (target.startsWith('user:')) {
    return { type: 'user', userId: target.slice(5) }
  }
  // 钉钉群 cid 是 'cidXXX...' 形式；按上游约定处理
  if (target.startsWith('cid')) {
    return { type: 'group', openConversationId: target }
  }
  // 兜底视为 userId
  return { type: 'user', userId: target }
}

// =============================================================================
// sendTextToDingTalk
// =============================================================================

/**
 * 发送文本消息到钉钉（target 是 "user:xxx" / "group:xxx" / 裸 ID / cidXXX）。
 *
 * 优先 AI Card；失败回退普通消息。
 */
export async function sendTextToDingTalk(params: {
  creds: ResolvedDingtalkCredentials
  target: string
  text: string
  replyToId?: string
}): Promise<SendResult> {
  const { creds, target, text, replyToId } = params
  if (!target) {
    return { ok: false, error: 'invalid target parameter', usedAICard: false }
  }
  const parsed = parseTargetString(target)
  return sendProactive(
    creds,
    parsed.type === 'user'
      ? { userId: parsed.userId }
      : { openConversationId: parsed.openConversationId },
    text,
    { msgType: 'text', replyToId },
  )
}

// =============================================================================
// sendMediaToDingTalk
// =============================================================================

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'])
const VIDEO_EXTS = new Set(['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'])
const VOICE_EXTS = new Set(['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac', 'wma', 'amr'])

/**
 * 钉钉 OAPI 媒体上传大小限制。
 */
function maxBytesForMedia(type: 'image' | 'voice' | 'video' | 'file'): number {
  switch (type) {
    case 'image': return 10 * 1024 * 1024
    case 'voice': return 2 * 1024 * 1024
    case 'video':
    case 'file':
    default: return 20 * 1024 * 1024
  }
}

function detectMediaType(ext: string): 'image' | 'file' | 'video' | 'voice' {
  const lower = ext.toLowerCase()
  if (IMAGE_EXTS.has(lower)) return 'image'
  if (VIDEO_EXTS.has(lower)) return 'video'
  if (VOICE_EXTS.has(lower)) return 'voice'
  return 'file'
}

/**
 * 发送媒体消息（图片/视频/音频/文件）。
 *
 * 流程：
 *   1. 先发文本（如果有）
 *   2. 判断媒体类型
 *   3. 上传到钉钉 → 得到 media_id
 *   4. 按媒体类型分发：
 *      - image: 走 sampleImageMsg（msgKey）
 *      - video: 抽元数据 + 抽封面 + 上传两个 + sampleVideo
 *      - voice: 抽时长 + 上传 + sampleAudio
 *      - file:  上传 + sampleFile
 */
export async function sendMediaToDingTalk(params: {
  creds: ResolvedDingtalkCredentials
  target: string
  text?: string
  mediaUrl: string
  replyToId?: string
  /** 相对路径搜索根（用于解析相对路径）*/
  mediaLocalRoots?: readonly string[]
}): Promise<SendResult> {
  const { creds, target, text, mediaUrl, replyToId } = params

  if (!target) {
    return { ok: false, error: 'invalid target parameter', usedAICard: false }
  }
  if (!mediaUrl) {
    return sendProactive(
      creds,
      targetToProactiveTarget(parseTargetString(target)),
      text ?? '⚠️ 缺少媒体文件 URL',
      { msgType: 'text', replyToId },
    )
  }

  const parsed = parseTargetString(target)
  const proactiveTarget = targetToProactiveTarget(parsed)
  const aiCardTarget: import('./messaging-types.js').AICardTarget =
    parsed.type === 'user'
      ? { type: 'user', userId: parsed.userId }
      : { type: 'group', openConversationId: parsed.openConversationId }

  // 1. 先发文本（如有）
  if (text && text.trim().length > 0) {
    await sendProactive(creds, proactiveTarget, text, { msgType: 'text', replyToId })
  }

  // 2. 判断媒体类型
  const ext = mediaUrl.toLowerCase().split('.').pop() ?? ''
  const mediaType = detectMediaType(ext)
  const maxSize = maxBytesForMedia(mediaType)

  // 3. 上传到钉钉
  const oapiToken = await getOapiAccessToken(creds)
  if (!oapiToken) {
    return sendProactive(
      creds,
      proactiveTarget,
      '⚠️ 媒体文件处理失败：缺少 oapiToken',
      { msgType: 'text', replyToId },
    )
  }

  // 解析相对路径
  const { toLocalPath } = await import('./media.js')
  const directPath = toLocalPath(mediaUrl)
  let resolved = mediaUrl
  if (params.mediaLocalRoots?.length) {
    const fs = await import('fs')
    const pathMod = await import('path')
    if (!fs.existsSync(directPath) && !pathMod.isAbsolute(directPath)) {
      for (const root of params.mediaLocalRoots) {
        const candidate = pathMod.resolve(root, directPath)
        if (fs.existsSync(candidate)) {
          resolved = candidate
          log.info(`resolved relative path: ${mediaUrl} → ${candidate}`)
          break
        }
      }
    }
  }

  // 4. 按类型分发
  if (mediaType === 'image') {
    const uploadResult = await uploadMediaToDingTalk(resolved, mediaType, oapiToken, maxSize, log)
    if (!uploadResult) {
      return sendProactive(creds, proactiveTarget, '⚠️ 媒体文件上传失败', { msgType: 'text', replyToId })
    }
    const result = await sendProactive(creds, proactiveTarget, uploadResult.mediaId, {
      msgType: 'image',
      replyToId,
    })
    return { ...result, processQueryKey: result.processQueryKey ?? 'image-message-sent' }
  }

  if (mediaType === 'video') {
    const { sendVideoProactive } = await import('./media-proactive.js')
    const { extractVideoMetadata, extractVideoThumbnail } = await import('./media-meta.js')
    const fs = await import('fs')
    const os = await import('os')
    const pathMod = await import('path')
    const { uploadMediaToDingTalk } = await import('./media.js')

    // 提取元数据（ffmpeg 缺失时降级为 null）
    const metadata = await extractVideoMetadata(resolved)

    // 抽封面（第1秒），失败时不带封面继续发
    let picMediaId = ''
    const thumbPath = pathMod.join(os.tmpdir(), `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.jpg`)
    const thumbResult = await extractVideoThumbnail(resolved, thumbPath)
    try {
      if (thumbResult && fs.existsSync(thumbPath)) {
        const picUpload = await uploadMediaToDingTalk(thumbPath, 'image', oapiToken, 20 * 1024 * 1024, log)
        if (picUpload) picMediaId = picUpload.mediaId
      }
    } finally {
      try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath) } catch { /* ignore */ }
    }

    const videoUpload = await uploadMediaToDingTalk(resolved, 'video', oapiToken, maxSize, log)
    if (!videoUpload) {
      return sendProactive(creds, proactiveTarget, '⚠️ 视频上传失败', { msgType: 'text', replyToId })
    }

    const result = await sendVideoProactive(creds, aiCardTarget, videoUpload.mediaId, picMediaId, metadata ?? undefined)
    return {
      ok: result.ok,
      usedAICard: false,
      processQueryKey: result.processQueryKey ?? 'video-message-sent',
      error: result.error,
    }
  }

  if (mediaType === 'voice') {
    const { sendAudioProactive } = await import('./media-proactive.js')
    const { extractAudioDuration } = await import('./media-meta.js')
    const { uploadMediaToDingTalk } = await import('./media.js')

    const upload = await uploadMediaToDingTalk(resolved, 'voice', oapiToken, maxSize, log)
    if (!upload) {
      return sendProactive(creds, proactiveTarget, '⚠️ 音频上传失败', { msgType: 'text', replyToId })
    }
    const durationMs = await extractAudioDuration(resolved)
    const result = await sendAudioProactive(
      creds,
      aiCardTarget,
      mediaUrl,
      upload.mediaId,
      durationMs ?? undefined,
    )
    return {
      ok: result.ok,
      usedAICard: false,
      processQueryKey: result.processQueryKey ?? 'audio-message-sent',
      error: result.error,
    }
  }

  // file 类型
  const { sendFileProactive } = await import('./media-proactive.js')
  const { uploadMediaToDingTalk } = await import('./media.js')
  const pathMod = await import('path')

  const upload = await uploadMediaToDingTalk(resolved, 'file', oapiToken, maxSize, log)
  if (!upload) {
    return sendProactive(creds, proactiveTarget, '⚠️ 文件上传失败', { msgType: 'text', replyToId })
  }
  const result = await sendFileProactive(
    creds,
    aiCardTarget,
    { path: resolved, fileName: pathMod.basename(resolved), fileType: ext },
    upload.mediaId,
  )
  return {
    ok: result.ok,
    usedAICard: false,
    processQueryKey: result.processQueryKey ?? 'file-message-sent',
    error: result.error,
  }
}

function targetToProactiveTarget(
  parsed: ParsedTarget,
): { userId: string } | { openConversationId: string } {
  return parsed.type === 'user'
    ? { userId: parsed.userId }
    : { openConversationId: parsed.openConversationId }
}

// =============================================================================
// 模块 re-export（让外部代码一处导入）
// =============================================================================

export { sendToGroup, sendToUser } from './messaging-proactive.js'
export { sendProactive } from './messaging-proactive.js'
export {
  sendMarkdownMessage,
  sendTextMessage,
  sendLinkMessage,
  sendMessage,
  buildMsgPayload,
} from './messaging-send.js'
export {
  createAICardForTarget,
  streamAICard,
  finishAICard,
  isQpsLimitError,
  normalizeForCard,
  fixNewlines,
} from './messaging-ai-card.js'
export {
  processLocalImages,
  uploadMediaToDingTalk,
  toLocalPath,
  extractVideoMarkers,
  extractAudioMarkers,
  extractFileMarkers,
  type VideoInfo,
  type AudioInfo,
  type FileInfo,
} from './media.js'
export {
  extractVideoMetadata,
  extractVideoThumbnail,
  extractAudioDuration,
  type VideoMetadata,
} from './media-meta.js'
export {
  sendVideoProactive,
  sendAudioProactive,
  sendFileProactive,
} from './media-proactive.js'
export {
  processVideoMarkers,
  processAudioMarkers,
  processFileMarkers,
} from './media-markers.js'
export { getAccessToken, getOapiAccessToken, clearTokenCache } from './tokens.js'
export {
  listAccountIds,
  resolveDefaultAccountId,
  resolveAccountConfig,
  resolveCredentials,
  fromSettings,
  type ResolvedAccount,
  type SelectionSource,
} from './accounts.js'
export {
  buildBindingsIndex,
  validateBindings,
  accountIdForAgent,
  agentIdsForAccount,
  type BindingsIndex,
  type DingtalkBinding,
} from './bindings.js'
export {
  buildBotMentionTable,
  substituteBotMentions,
  resolveAtAccountIdsToChatbotUserIds,
  prepareMultiBotMentions,
  type BotMentionEntry,
  type BuildMentionTableOptions,
} from './mentions.js'
export {
  DINGTALK_API,
  DINGTALK_OAPI,
  AI_CARD_TEMPLATE_ID,
  MEDIA_MSG_TYPES,
  type SendResult,
  type AICardTarget,
  type AICardInstance,
  type DingTalkMsgType,
  type ProactiveSendOptions,
  type MediaType,
  type UploadResult,
} from './messaging-types.js'

// 直接供 DSH tools/runtime 用的"high-level"形态
export const __messagingVersion = '0.3.0'