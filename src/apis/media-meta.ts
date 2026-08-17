/**
 * Media metadata extraction — 视频时长/分辨率/封面 + 音频时长.
 *
 * Fork 自上游 connector 的 services/media.ts:227-307（extractVideoMetadata /
 * extractVideoThumbnail / extractAudioDuration）。
 *
 * 设计：
 *   - ffmpeg / ffprobe 作为**可选依赖**：用 dynamic import + try/catch。
 *     安装了 fluent-ffmpeg + @ffmpeg-installer/ffmpeg + @ffprobe-installer/ffprobe
 *     才能用元数据；缺失时返回 null，由调用方降级。
 *   - 上游用 require() 加载；本仓库用 await import()（ESM 友好）。
 *   - 不阻塞主流程：失败时返回 null，绝不抛错。
 *
 * 调用方：
 *   - sendVideoProactive → 需要 duration / width / height
 *   - sendAudioProactive → 需要 durationMs
 *   - 封面图：processVideoMarkers → 需要 image 文件
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-media-meta')

// =============================================================================
// Types
// =============================================================================

export interface VideoMetadata {
  /** 毫秒 */
  duration: number
  /** 像素 */
  width: number
  /** 像素 */
  height: number
}

// =============================================================================
// ffmpeg / ffprobe dynamic loaders
// =============================================================================

async function loadFfmpeg(): Promise<unknown | null> {
  try {
    const mod = await import('fluent-ffmpeg')
    return (mod as { default?: unknown }).default ?? mod
  } catch {
    return null
  }
}

async function loadFfprobePath(): Promise<string | null> {
  try {
    const mod = await import('@ffprobe-installer/ffprobe')
    return (mod as { path?: string }).path ?? null
  } catch {
    return null
  }
}

async function loadFfmpegPath(): Promise<string | null> {
  try {
    const mod = await import('@ffmpeg-installer/ffmpeg')
    return (mod as { path?: string }).path ?? null
  } catch {
    return null
  }
}

// =============================================================================
// Video metadata
// =============================================================================

/**
 * 用 ffprobe 提取视频元数据（duration / width / height）。
 * ffmpeg/ffprobe 缺失时返回 null。
 */
export async function extractVideoMetadata(
  filePath: string,
): Promise<VideoMetadata | null> {
  if (!fs.existsSync(filePath)) {
    log.warn(`video file not found: ${filePath}`)
    return null
  }
  try {
    const ffmpeg = (await loadFfmpeg()) as
      | {
          setFfprobePath: (p: string) => void
          ffprobe: (p: string, cb: (err: unknown, meta: unknown) => void) => void
        }
      | null
    if (!ffmpeg) {
      log.warn('fluent-ffmpeg not installed; skipping video metadata extraction')
      return null
    }
    const ffprobePath = await loadFfprobePath()
    if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)

    return new Promise<VideoMetadata | null>((resolve) => {
      ffmpeg.ffprobe(filePath, (err: unknown, meta: unknown) => {
        if (err) {
          log.warn(`ffprobe failed: ${(err as Error).message}`)
          resolve(null)
          return
        }
        try {
          const m = meta as {
            format?: { duration?: string | number }
            streams?: Array<{ codec_type?: string; width?: number; height?: number }>
          }
          const duration = m.format?.duration
            ? Math.round(parseFloat(String(m.format.duration)) * 1000)
            : 0
          const videoStream = m.streams?.find((s) => s.codec_type === 'video')
          resolve({
            duration,
            width: videoStream?.width ?? 0,
            height: videoStream?.height ?? 0,
          })
        } catch {
          log.warn('failed to parse ffprobe output')
          resolve(null)
        }
      })
    })
  } catch (err) {
    log.warn(`extractVideoMetadata error: ${(err as Error).message}`)
    return null
  }
}

// =============================================================================
// Video thumbnail
// =============================================================================

/**
 * 用 ffmpeg 在视频第 1 秒截图，输出 jpg。
 * 返回临时文件路径；调用方负责清理（processVideoMarkers 会在 finally unlink）。
 *
 * ffmpeg 缺失时返回 null——视频消息没有封面也能发（picMediaId=''）。
 */
export async function extractVideoThumbnail(
  videoPath: string,
  outputPath?: string,
): Promise<string | null> {
  if (!fs.existsSync(videoPath)) {
    log.warn(`video file not found: ${videoPath}`)
    return null
  }
  try {
    const ffmpeg = (await loadFfmpeg()) as
      | {
          setFfmpegPath: (p: string) => void
          (p: string): {
            screenshots: (opts: unknown) => {
              on: (event: string, cb: (...args: unknown[]) => void) => unknown
            }
          }
        }
      | null
    if (!ffmpeg) {
      log.warn('fluent-ffmpeg not installed; skipping video thumbnail extraction')
      return null
    }
    const ffmpegPath = await loadFfmpegPath()
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

    const out =
      outputPath ?? path.join(os.tmpdir(), `thumbnail_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.jpg`)
    return new Promise<string | null>((resolve) => {
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: path.dirname(out),
          filename: path.basename(out),
          timemarks: ['1'],
          size: '?x360',
        })
        .on('end', () => resolve(out))
        .on('error', (err: unknown) => {
          log.warn(`thumbnail extraction failed: ${(err as Error).message}`)
          resolve(null)
        })
    })
  } catch (err) {
    log.warn(`extractVideoThumbnail error: ${(err as Error).message}`)
    return null
  }
}

// =============================================================================
// Audio duration
// =============================================================================

/**
 * 用 ffprobe 提取音频时长（毫秒）。
 * ffmpeg 缺失时返回 null → 调用方默认 60000ms（钉钉允许的最低值）。
 */
export async function extractAudioDuration(filePath: string): Promise<number | null> {
  if (!fs.existsSync(filePath)) {
    log.warn(`audio file not found: ${filePath}`)
    return null
  }
  try {
    const ffmpeg = (await loadFfmpeg()) as
      | {
          setFfprobePath: (p: string) => void
          ffprobe: (p: string, cb: (err: unknown, meta: unknown) => void) => void
        }
      | null
    if (!ffmpeg) {
      log.warn('fluent-ffmpeg not installed; skipping audio duration extraction')
      return null
    }
    const ffprobePath = await loadFfprobePath()
    if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)

    return new Promise<number | null>((resolve) => {
      ffmpeg.ffprobe(filePath, (err: unknown, meta: unknown) => {
        if (err) {
          log.warn(`ffprobe failed: ${(err as Error).message}`)
          resolve(null)
          return
        }
        try {
          const m = meta as { format?: { duration?: string | number } }
          const duration = m.format?.duration
            ? Math.round(parseFloat(String(m.format.duration)) * 1000)
            : 0
          resolve(duration)
        } catch {
          resolve(null)
        }
      })
    })
  } catch (err) {
    log.warn(`extractAudioDuration error: ${(err as Error).message}`)
    return null
  }
}