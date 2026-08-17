/**
 * Media upload + processing.
 *
 * Fork 自上游 connector 的 services/media.ts。剥离 OpenClaw 引用，
 * 改为接受 ResolvedDingtalkCredentials + oapiToken（分开注入，避免循环依赖）。
 *
 * 能力：
 *   - uploadMediaToDingTalk(filePath, mediaType, oapiToken, maxSize, log)
 *   - processLocalImages(content, oapiToken, log)
 *   - VIDEO / AUDIO / FILE 标记解析（preprocess 阶段用；下游由 messaging.ts 调度）
 *
 * 注：上游的 sendVideoProactive / sendAudioProactive / sendFileProactive
 * 在本仓库中并入 messaging.ts 的 sendMediaToDingTalk，避免拆得过细。
 */

import * as fs from 'fs'
import * as path from 'path'
import FormData from 'form-data'
import { DINGTALK_OAPI } from './messaging-types.js'
import type { MediaType, UploadResult } from './messaging-types.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { createLogger } from '../utils/logger.js'

// =============================================================================
// 常量
// =============================================================================

export const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.html',
  '.css', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h',
  '.sh', '.bat', '.csv',
])

export const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|bmp|webp|tiff|svg)$/i

/** markdown 图片语法 ![alt](path) */
export const LOCAL_IMAGE_RE =
  /!\[([^\]]*)\]\(((?:file:\/\/\/|MEDIA:|attachment:\/\/\/)[^)]+|\/(?:tmp|var|private|Users|home|root)[^)]+|[A-Za-z]:[\\/][^)]+)\)/g

/** 纯文本图片路径 */
export const BARE_IMAGE_PATH_RE =
  /`?((?:\/(?:tmp|var|private|Users|home|root)\/[^\s`'",)]+|[A-Za-z]:[\\/][^\s`'",)]+)\.(?:png|jpg|jpeg|gif|bmp|webp))`?/gi

/** 视频/音频/文件标记 */
export const VIDEO_MARKER_PATTERN = /\[DINGTALK_VIDEO\](.*?)\[\/DINGTALK_VIDEO\]/gs
export const AUDIO_MARKER_PATTERN = /\[DINGTALK_AUDIO\](.*?)\[\/DINGTALK_AUDIO\]/gs
export const FILE_MARKER_PATTERN = /\[DINGTALK_FILE\](.*?)\[\/DINGTALK_FILE\]/gs

// =============================================================================
// 工具
// =============================================================================

export function toLocalPath(raw: string): string {
  let filePath = raw
  if (filePath.startsWith('file://')) filePath = filePath.replace('file://', '')
  else if (filePath.startsWith('MEDIA:')) filePath = filePath.replace('MEDIA:', '')
  else if (filePath.startsWith('attachment://')) filePath = filePath.replace('attachment://', '')
  try {
    filePath = decodeURIComponent(filePath)
  } catch {
    /* keep raw */
  }
  return filePath
}

// =============================================================================
// 上传
// =============================================================================

const defaultLog = createLogger('dingtalk-media')

/**
 * 上传本地媒体文件到钉钉，返回 { mediaId, cleanMediaId, downloadUrl }。
 * 失败返回 null（调用方应降级到文本提示）。
 */
export async function uploadMediaToDingTalk(
  filePath: string,
  mediaType: MediaType,
  oapiToken: string,
  maxSize: number = 20 * 1024 * 1024,
  log: ReturnType<typeof createLogger> = defaultLog,
): Promise<UploadResult | null> {
  try {
    const absPath = toLocalPath(filePath)
    if (!fs.existsSync(absPath)) {
      log.warn(`file not found: ${absPath}`)
      return null
    }
    const stats = fs.statSync(absPath)
    if (stats.size > maxSize) {
      log.warn(
        `file too large: ${absPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(0)}MB)`,
      )
      return null
    }

    const getContentType = (): string => {
      const ext = path.extname(absPath).toLowerCase()
      if (mediaType === 'image') return ext === '.png' ? 'image/png' : 'image/jpeg'
      if (mediaType === 'video') return ext === '.mp4' ? 'video/mp4' : 'video/quicktime'
      if (mediaType === 'voice') return ext === '.mp3' ? 'audio/mpeg' : 'audio/amr'
      return 'application/octet-stream'
    }

    const form = new FormData()
    form.append('media', fs.createReadStream(absPath), {
      filename: path.basename(absPath),
      contentType: getContentType(),
    })

    const http = getDingtalkHttpClient({ baseURL: DINGTALK_OAPI })
    const resp = await http.post<{ media_id: string }>(
      `/media/upload?access_token=${oapiToken}&type=${mediaType === 'video' ? 'file' : mediaType}`,
      form,
      { headers: form.getHeaders(), timeout: 60_000 },
    )
    const mediaId = resp.data?.media_id
    if (mediaId) {
      const cleanMediaId = mediaId.startsWith('@') ? mediaId.substring(1) : mediaId
      const downloadUrl = `https://down.dingtalk.com/media/${cleanMediaId}`
      return { mediaId, cleanMediaId, downloadUrl }
    }
    log.warn(`upload returned no media_id: ${JSON.stringify(resp.data)}`)
    return null
  } catch (err) {
    log.error(`upload failed: ${(err as Error).message}`)
    return null
  }
}

// =============================================================================
// 图片后处理：扫描 markdown 中的本地图片路径，上传并替换为 media download URL
// =============================================================================

/**
 * 扫描 content 中的本地图片（markdown 语法 + 纯文本路径），
 * 上传到钉钉并把路径替换为 `https://down.dingtalk.com/media/<id>`。
 *
 * 上传失败时保留原路径（不抛错）。
 */
export async function processLocalImages(
  content: string,
  oapiToken: string | null,
  log: ReturnType<typeof createLogger> = defaultLog,
): Promise<string> {
  if (!oapiToken) {
    log.warn('no oapiToken; skip image post-processing')
    return content
  }

  let result = content

  // 1. markdown 语法 ![alt](path)
  const mdMatches = [...content.matchAll(LOCAL_IMAGE_RE)]
  if (mdMatches.length > 0) {
    log.info(`detected ${mdMatches.length} markdown images, uploading...`)
    for (const match of mdMatches) {
      const [fullMatch, alt, rawPath] = match
      const cleanPath = rawPath.replace(/\\ /g, ' ')
      const uploadResult = await uploadMediaToDingTalk(cleanPath, 'image', oapiToken, 20 * 1024 * 1024, log)
      if (uploadResult) {
        result = result.replace(fullMatch, `![${alt}](${uploadResult.downloadUrl})`)
      }
    }
  }

  // 2. 纯文本路径
  const bareMatches = [...result.matchAll(BARE_IMAGE_PATH_RE)]
  const newBareMatches = bareMatches.filter((m) => {
    if (m.index === undefined) return false
    const before = result.slice(Math.max(0, m.index - 10), m.index)
    return !before.includes('](')
  })
  if (newBareMatches.length > 0) {
    log.info(`detected ${newBareMatches.length} bare image paths, uploading...`)
    for (const match of newBareMatches.reverse()) {
      const [fullMatch, rawPath] = match
      const uploadResult = await uploadMediaToDingTalk(rawPath, 'image', oapiToken, 20 * 1024 * 1024, log)
      if (uploadResult && match.index !== undefined) {
        result = result.slice(0, match.index) + result.slice(match.index).replace(fullMatch, `![](${uploadResult.downloadUrl})`)
      }
    }
  }

  return result
}

// =============================================================================
// 标记提取（用于 agent 在 markdown 中嵌入 [DINGTALK_VIDEO]path[/DINGTALK_VIDEO]
//   这样的标记来触发独立视频消息发送）
// =============================================================================

export interface VideoInfo {
  path: string
  thumbnailPath?: string
}

export interface AudioInfo {
  path: string
  duration?: number
}

export interface FileInfo {
  path: string
  fileName?: string
  fileType?: string
}

export function extractVideoMarkers(content: string): { text: string; videos: VideoInfo[] } {
  const videos: VideoInfo[] = []
  const text = content.replace(VIDEO_MARKER_PATTERN, (_match, body: string) => {
    try {
      const parsed = JSON.parse(body) as VideoInfo
      videos.push(parsed)
    } catch {
      /* invalid marker, skip */
    }
    return ''
  })
  return { text, videos }
}

export function extractAudioMarkers(content: string): { text: string; audios: AudioInfo[] } {
  const audios: AudioInfo[] = []
  const text = content.replace(AUDIO_MARKER_PATTERN, (_match, body: string) => {
    try {
      const parsed = JSON.parse(body) as AudioInfo
      audios.push(parsed)
    } catch {
      /* skip */
    }
    return ''
  })
  return { text, audios }
}

export function extractFileMarkers(content: string): { text: string; files: FileInfo[] } {
  const files: FileInfo[] = []
  const text = content.replace(FILE_MARKER_PATTERN, (_match, body: string) => {
    try {
      const parsed = JSON.parse(body) as FileInfo
      files.push(parsed)
    } catch {
      /* skip */
    }
    return ''
  })
  return { text, files }
}