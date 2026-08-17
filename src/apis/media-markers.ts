/**
 * Media marker processing — 扫描文本中的 [DINGTALK_VIDEO|AUDIO|FILE] 标记
 * 完成"上传 → 发送独立消息 → 返回清理后的 content"完整流程.
 *
 * Fork 自上游 connector 的 services/media.ts:312-702（processVideoMarkers /
 * processAudioMarkers / processFileMarkers）。
 *
 * 适配：
 *   - DingtalkConfig → ResolvedDingtalkCredentials
 *   - 不再 import `config.clientId` 隐式拿 robotCode（统一走 creds.clientId）
 *   - useProactiveApi 改为显式必填——本仓库只支持 proactive API
 *   - 缺 oapiToken 时不抛错，返回原 content
 *
 * 协议层来自 media-proactive.ts，metadata来自 media-meta.ts。
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { ResolvedDingtalkCredentials } from '../types.js'
import type { AICardTarget } from './messaging-types.js'
import { uploadMediaToDingTalk } from './media.js'
import { extractVideoMetadata, extractVideoThumbnail, extractAudioDuration } from './media-meta.js'
import { sendVideoProactive, sendAudioProactive, sendFileProactive } from './media-proactive.js'
import {
  VIDEO_MARKER_PATTERN,
  AUDIO_MARKER_PATTERN,
  FILE_MARKER_PATTERN,
  type VideoInfo,
  type AudioInfo,
  type FileInfo,
} from './media.js'
import { getOapiAccessToken } from './tokens.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-media-markers')

interface MarkerProcessOpts {
  creds: ResolvedDingtalkCredentials
  target: AICardTarget
  /** 媒体上传大小限制（默认 20MB）*/
  maxBytes?: number
}

// =============================================================================
// Video markers
// =============================================================================

/**
 * 扫描 content 中的 [DINGTALK_VIDEO]{...}[/DINGTALK_VIDEO] 标记：
 *   - 提取视频元数据 + 封面图
 *   - 上传视频 + 封面上传到钉钉
 *   - 调用 sampleVideo 发送独立消息
 *   - 返回替换后的 content（含 status 消息）
 */
export async function processVideoMarkers(
  content: string,
  opts: MarkerProcessOpts,
): Promise<string> {
  const oapiToken = await getOapiAccessToken(opts.creds)
  if (!oapiToken) {
    log.warn('no oapiToken; video processing skipped')
    return content
  }

  const matches = [...content.matchAll(VIDEO_MARKER_PATTERN)]
  const videos: VideoInfo[] = []
  const invalidPaths: string[] = []
  for (const match of matches) {
    try {
      const info = JSON.parse(match[1]) as VideoInfo
      if (info.path && fs.existsSync(info.path)) {
        videos.push(info)
      } else {
        invalidPaths.push(info.path || 'unknown')
      }
    } catch (err) {
      log.warn(`video marker parse error: ${(err as Error).message}`)
    }
  }

  if (videos.length === 0 && invalidPaths.length === 0) {
    return content.replace(VIDEO_MARKER_PATTERN, '').trim()
  }

  let cleanedContent = content.replace(VIDEO_MARKER_PATTERN, '').trim()
  const statusMessages: string[] = []
  for (const p of invalidPaths) {
    statusMessages.push(`⚠️ 视频文件不存在: ${path.basename(p)}`)
  }

  for (const v of videos) {
    const fileName = path.basename(v.path)
    let thumbnailPath = ''
    try {
      const metadata = await extractVideoMetadata(v.path)
      if (!metadata) {
        statusMessages.push(`⚠️ 视频处理失败: ${fileName}（无法读取视频信息）`)
        continue
      }

      thumbnailPath = path.join(os.tmpdir(), `thumbnail_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.jpg`)
      const thumbResult = await extractVideoThumbnail(v.path, thumbnailPath)
      // 即使 thumbnail 失败也尝试发送视频（无封面）
      let picMediaId = ''
      if (thumbResult && fs.existsSync(thumbnailPath)) {
        const picUpload = await uploadMediaToDingTalk(thumbnailPath, 'image', oapiToken, 20 * 1024 * 1024, log)
        if (picUpload) picMediaId = picUpload.mediaId
      } else {
        log.warn(`thumbnail extraction failed for ${fileName}; sending without cover`)
      }

      const videoUpload = await uploadMediaToDingTalk(v.path, 'video', oapiToken, opts.maxBytes ?? 20 * 1024 * 1024, log)
      if (!videoUpload) {
        statusMessages.push(`⚠️ 视频上传失败: ${fileName}`)
        continue
      }
      const result = await sendVideoProactive(opts.creds, opts.target, videoUpload.mediaId, picMediaId, metadata)
      if (result.ok) {
        statusMessages.push(`✅ 视频已发送: ${fileName}`)
      } else {
        statusMessages.push(`⚠️ 视频发送失败: ${fileName} (${result.error ?? 'unknown'})`)
      }
    } catch (err) {
      log.error(`video process error: ${(err as Error).message}`)
      statusMessages.push(`⚠️ 视频处理异常: ${fileName}`)
    } finally {
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        try {
          fs.unlinkSync(thumbnailPath)
        } catch {
          /* ignore cleanup failure */
        }
      }
    }
  }

  if (statusMessages.length > 0) {
    const statusText = statusMessages.join('\n')
    cleanedContent = cleanedContent ? `${cleanedContent}\n\n${statusText}` : statusText
  }
  return cleanedContent
}

// =============================================================================
// Audio markers
// =============================================================================

/**
 * 扫描 content 中的 [DINGTALK_AUDIO]{...}[/DINGTALK_AUDIO] 标记。
 */
export async function processAudioMarkers(
  content: string,
  opts: MarkerProcessOpts,
): Promise<string> {
  const oapiToken = await getOapiAccessToken(opts.creds)
  if (!oapiToken) {
    log.warn('no oapiToken; audio processing skipped')
    return content
  }

  const matches = [...content.matchAll(AUDIO_MARKER_PATTERN)]
  const audios: AudioInfo[] = []
  const invalidPaths: string[] = []
  for (const match of matches) {
    try {
      const info = JSON.parse(match[1]) as AudioInfo
      if (info.path && fs.existsSync(info.path)) {
        audios.push(info)
      } else {
        invalidPaths.push(info.path || 'unknown')
      }
    } catch (err) {
      log.warn(`audio marker parse error: ${(err as Error).message}`)
    }
  }

  if (audios.length === 0 && invalidPaths.length === 0) {
    return content.replace(AUDIO_MARKER_PATTERN, '').trim()
  }

  let cleanedContent = content.replace(AUDIO_MARKER_PATTERN, '').trim()
  const statusMessages: string[] = []
  for (const p of invalidPaths) {
    statusMessages.push(`⚠️ 音频文件不存在: ${path.basename(p)}`)
  }

  for (const a of audios) {
    const fileName = path.basename(a.path)
    try {
      const upload = await uploadMediaToDingTalk(a.path, 'voice', oapiToken, opts.maxBytes ?? 2 * 1024 * 1024, log)
      if (!upload) {
        statusMessages.push(`⚠️ 音频上传失败: ${fileName}`)
        continue
      }
      const durationMs = await extractAudioDuration(a.path)
      const result = await sendAudioProactive(opts.creds, opts.target, fileName, upload.mediaId, durationMs ?? undefined)
      if (result.ok) {
        statusMessages.push(`✅ 音频已发送: ${fileName}`)
      } else {
        statusMessages.push(`⚠️ 音频发送失败: ${fileName} (${result.error ?? 'unknown'})`)
      }
    } catch (err) {
      log.error(`audio process error: ${(err as Error).message}`)
      statusMessages.push(`⚠️ 音频处理异常: ${fileName}`)
    }
  }

  if (statusMessages.length > 0) {
    const statusText = statusMessages.join('\n')
    cleanedContent = cleanedContent ? `${cleanedContent}\n\n${statusText}` : statusText
  }
  return cleanedContent
}

// =============================================================================
// File markers
// =============================================================================

/**
 * 扫描 content 中的 [DINGTALK_FILE]{...}[/DINGTALK_FILE] 标记。
 */
export async function processFileMarkers(
  content: string,
  opts: MarkerProcessOpts,
): Promise<string> {
  const oapiToken = await getOapiAccessToken(opts.creds)
  if (!oapiToken) {
    log.warn('no oapiToken; file processing skipped')
    return content
  }

  const matches = [...content.matchAll(FILE_MARKER_PATTERN)]
  const files: FileInfo[] = []
  const invalidPaths: string[] = []
  for (const match of matches) {
    try {
      const info = JSON.parse(match[1]) as FileInfo
      if (info.path && fs.existsSync(info.path)) {
        files.push(info)
      } else {
        invalidPaths.push(info.path || 'unknown')
      }
    } catch (err) {
      log.warn(`file marker parse error: ${(err as Error).message}`)
    }
  }

  if (files.length === 0 && invalidPaths.length === 0) {
    return content.replace(FILE_MARKER_PATTERN, '').trim()
  }

  let cleanedContent = content.replace(FILE_MARKER_PATTERN, '').trim()
  const statusMessages: string[] = []
  for (const p of invalidPaths) {
    statusMessages.push(`⚠️ 文件不存在: ${path.basename(p)}`)
  }

  for (const f of files) {
    const fileName = f.fileName || path.basename(f.path)
    try {
      const upload = await uploadMediaToDingTalk(f.path, 'file', oapiToken, opts.maxBytes ?? 20 * 1024 * 1024, log)
      if (!upload) {
        statusMessages.push(`⚠️ 文件上传失败: ${fileName}`)
        continue
      }
      const result = await sendFileProactive(opts.creds, opts.target, f, upload.mediaId)
      if (result.ok) {
        statusMessages.push(`✅ 文件已发送: ${fileName}`)
      } else {
        statusMessages.push(`⚠️ 文件发送失败: ${fileName} (${result.error ?? 'unknown'})`)
      }
    } catch (err) {
      log.error(`file process error: ${(err as Error).message}`)
      statusMessages.push(`⚠️ 文件处理异常: ${fileName}`)
    }
  }

  if (statusMessages.length > 0) {
    const statusText = statusMessages.join('\n')
    cleanedContent = cleanedContent ? `${cleanedContent}\n\n${statusText}` : statusText
  }
  return cleanedContent
}