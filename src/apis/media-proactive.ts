/**
 * Media proactive send — 视频/音频/文件消息主动发送.
 *
 * Fork 自上游 connector 的 services/media.ts:758-1007（sendVideoProactive /
 * sendAudioProactive / sendFileProactive）。
 *
 * 适配：
 *   - DingtalkConfig → ResolvedDingtalkCredentials
 *   - 不再 import `dingtalkHttp`（在 apis/ 里用统一的 getDingtalkHttpClient）
 *   - 把"先 token 拿取 + POST + 校验 processQueryKey"的样板收成 helper
 */

import * as path from 'path'
import type { ResolvedDingtalkCredentials } from '../types.js'
import { DINGTALK_API } from './messaging-types.js'
import type { AICardTarget } from './messaging-types.js'
import { getAccessToken } from './tokens.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { createLogger } from '../utils/logger.js'
import type { VideoMetadata } from './media-meta.js'

const log = createLogger('dingtalk-media-proactive')

// =============================================================================
// Internal helper: post a sample* msg to batchSend or groupMessages/send
// =============================================================================

interface SendSampleOpts {
  creds: ResolvedDingtalkCredentials
  target: AICardTarget
  msgKey: string
  msgParam: Record<string, unknown>
  timeoutMs?: number
}

async function postSampleMessage(opts: SendSampleOpts): Promise<{ ok: boolean; processQueryKey?: string; raw?: unknown }> {
  const token = await getAccessToken(opts.creds)
  const isUser = opts.target.type === 'user'
  const endpoint = isUser
    ? `${DINGTALK_API}/v1.0/robot/oToMessages/batchSend`
    : `${DINGTALK_API}/v1.0/robot/groupMessages/send`

  const body: Record<string, unknown> = {
    robotCode: String(opts.creds.clientId),
    msgKey: opts.msgKey,
    msgParam: JSON.stringify(opts.msgParam),
  }
  if (isUser) {
    body.userIds = [opts.target.userId]
  } else {
    body.openConversationId = opts.target.openConversationId
  }

  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
  try {
    const resp = await http.post(endpoint, body, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
      timeout: opts.timeoutMs ?? 10_000,
    })
    if (resp.data?.processQueryKey) {
      return { ok: true, processQueryKey: resp.data.processQueryKey, raw: resp.data }
    }
    log.warn(`send failed: ${JSON.stringify(resp.data)}`)
    return { ok: false, raw: resp.data }
  } catch (err) {
    log.error(`post error: ${(err as Error).message}`)
    return { ok: false }
  }
}

// =============================================================================
// Video
// =============================================================================

/**
 * 主动发送视频消息。
 *
 * 钉钉 sampleVideo 消息要求：
 *   { duration: '60000', videoMediaId, videoType: 'mp4', picMediaId: '' | mediaId }
 *
 * 上游实测：picMediaId 不传也能发，但带封面是用户体验加分项。
 */
export async function sendVideoProactive(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  videoMediaId: string,
  picMediaId: string = '',
  metadata?: VideoMetadata,
): Promise<{ ok: boolean; processQueryKey?: string; error?: string }> {
  const msgParam = {
    duration: metadata?.duration ? String(metadata.duration) : '60000',
    videoMediaId,
    videoType: 'mp4',
    picMediaId,
  }
  const result = await postSampleMessage({
    creds,
    target,
    msgKey: 'sampleVideo',
    msgParam,
  })
  if (!result.ok) {
    return {
      ok: false,
      error: JSON.stringify(result.raw ?? 'unknown'),
    }
  }
  log.debug(`video sent, processQueryKey=${result.processQueryKey}`)
  return { ok: true, processQueryKey: result.processQueryKey }
}

// =============================================================================
// Audio
// =============================================================================

/**
 * 主动发送音频消息。
 *
 * 钉钉 sampleAudio 消息格式：
 *   { mediaId, duration: '60000' }
 *
 * 注：上游用 downloadUrl，但钉钉服务端实际接收的是 media_id（不是 URL）。
 * 本仓库统一用 media_id —— 如果调用方传的是 downloadUrl，需要在调用前
 * 用 uploadMediaToDingTalk 的 downloadUrl 字段反查（PR-4 优化）。
 */
export async function sendAudioProactive(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  fileName: string,
  mediaId: string,
  durationMs?: number,
): Promise<{ ok: boolean; processQueryKey?: string; error?: string }> {
  const actualDuration = durationMs && durationMs > 0 ? String(durationMs) : '60000'
  const result = await postSampleMessage({
    creds,
    target,
    msgKey: 'sampleAudio',
    msgParam: { mediaId, duration: actualDuration },
  })
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw ?? 'unknown') }
  }
  log.debug(`audio sent: ${fileName}, processQueryKey=${result.processQueryKey}`)
  return { ok: true, processQueryKey: result.processQueryKey }
}

// =============================================================================
// File
// =============================================================================

/**
 * 主动发送文件消息。
 *
 * 钉钉 sampleFile 消息格式：
 *   { mediaId, fileName, fileType }
 *
 * 字段缺省值：
 *   - fileName 默认 path basename
 *   - fileType 默认扩展名
 */
export async function sendFileProactive(
  creds: ResolvedDingtalkCredentials,
  target: AICardTarget,
  fileInfo: { path: string; fileName?: string; fileType?: string },
  mediaId: string,
): Promise<{ ok: boolean; processQueryKey?: string; error?: string }> {
  const resolvedFileName = fileInfo.fileName || path.basename(fileInfo.path)
  const resolvedFileType =
    fileInfo.fileType || resolvedFileName.split('.').pop() || 'file'

  const result = await postSampleMessage({
    creds,
    target,
    msgKey: 'sampleFile',
    msgParam: { mediaId, fileName: resolvedFileName, fileType: resolvedFileType },
  })
  if (!result.ok) {
    return { ok: false, error: JSON.stringify(result.raw ?? 'unknown') }
  }
  log.debug(`file sent: ${resolvedFileName}, processQueryKey=${result.processQueryKey}`)
  return { ok: true, processQueryKey: result.processQueryKey }
}

// =============================================================================
// Re-exports
// =============================================================================

export { sendVideoProactive as sendVideoProactiveMessage }
export { sendAudioProactive as sendAudioProactiveMessage }
export { sendFileProactive as sendFileProactiveMessage }