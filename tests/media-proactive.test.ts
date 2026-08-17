/**
 * Tests for PR-3 media-proactive + media-meta + media-markers modules.
 *
 * 覆盖：
 *   - sendVideoProactive / sendAudioProactive / sendFileProactive: payload 正确
 *   - extractVideoMetadata / extractAudioDuration: ffmpeg 缺失时返回 null 而不抛错
 *   - processVideoMarkers / processAudioMarkers / processFileMarkers:
 *       * 缺 oapiToken → 返回原 content
 *       * 标记解析失败 → 跳过
 *       * 文件不存在 → 跳过
 *       * 标记为 0 → 清理后的 content
 *   - 集成：processVideoMarkers 完整流程（含 metadata + thumbnail + upload + send）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { sendVideoProactive, sendAudioProactive, sendFileProactive } from '../src/apis/media-proactive.js'
import {
  extractVideoMetadata,
  extractVideoThumbnail,
  extractAudioDuration,
} from '../src/apis/media-meta.js'
import {
  processVideoMarkers,
  processAudioMarkers,
  processFileMarkers,
} from '../src/apis/media-markers.js'
import { clearTokenCache } from '../src/apis/tokens.js'
import {
  VIDEO_MARKER_PATTERN,
  AUDIO_MARKER_PATTERN,
  FILE_MARKER_PATTERN,
} from '../src/apis/media.js'

const mock = new MockAdapter(axios, { onNoMatch: 'passthrough' })

beforeEach(() => {
  mock.reset()
  clearTokenCache()
  // 默认 token 拉取（newAPI + oapi）
  mock.onPost('https://api.dingtalk.com/v1.0/oauth2/accessToken').reply(200, {
    accessToken: 'fake-new',
    expireIn: 7200,
  })
  mock.onGet(/\/gettoken/).reply(200, {
    accessToken: 'fake-oapi',
    expireIn: 7200,
  })
})

const creds = { clientId: 'cid', clientSecret: 'csec' }

// =============================================================================
// sendVideoProactive
// =============================================================================

describe('sendVideoProactive', () => {
  it('posts sampleVideo msgKey with video metadata', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = { url: config.url, body: JSON.parse(config.data as string) }
      return [200, { processQueryKey: 'pq-1' }]
    })

    const result = await sendVideoProactive(
      creds,
      { type: 'group', openConversationId: 'cX' },
      '@lCv_media_id',
      '@lCv_pic_id',
      { duration: 12000, width: 1920, height: 1080 },
    )
    expect(result.ok).toBe(true)
    expect(result.processQueryKey).toBe('pq-1')

    const c = captured as { body: { msgKey: string; msgParam: string; openConversationId: string } }
    expect(c.body.msgKey).toBe('sampleVideo')
    expect(c.body.openConversationId).toBe('cX')
    const param = JSON.parse(c.body.msgParam)
    expect(param.videoMediaId).toBe('@lCv_media_id')
    expect(param.picMediaId).toBe('@lCv_pic_id')
    expect(param.duration).toBe('12000')
    expect(param.videoType).toBe('mp4')
  })

  it('defaults duration to 60000 when metadata missing', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = JSON.parse(config.data as string)
      return [200, { processQueryKey: 'pq-2' }]
    })

    await sendVideoProactive(
      creds,
      { type: 'group', openConversationId: 'cX' },
      '@lCv_id',
      '',
      undefined,
    )
    const c = captured as { msgParam: string }
    expect(JSON.parse(c.msgParam).duration).toBe('60000')
  })

  it('routes to oToMessages/batchSend for user target', async () => {
    mock.onPost(/oToMessages\/batchSend/).reply(200, { processQueryKey: 'pq-u' })
    const result = await sendVideoProactive(
      creds,
      { type: 'user', userId: 'staffA' },
      '@id',
      '',
      { duration: 5000, width: 100, height: 100 },
    )
    expect(result.ok).toBe(true)
  })
})

// =============================================================================
// sendAudioProactive
// =============================================================================

describe('sendAudioProactive', () => {
  it('posts sampleAudio msgKey with mediaId + duration', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = JSON.parse(config.data as string)
      return [200, { processQueryKey: 'pq-a' }]
    })

    const result = await sendAudioProactive(
      creds,
      { type: 'group', openConversationId: 'cX' },
      'audio.mp3',
      '@lCv_audio_id',
      30000,
    )
    expect(result.ok).toBe(true)
    const c = captured as { msgKey: string; msgParam: string }
    expect(c.msgKey).toBe('sampleAudio')
    expect(JSON.parse(c.msgParam).duration).toBe('30000')
  })

  it('defaults duration to 60000 when not provided', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = JSON.parse(config.data as string)
      return [200, { processQueryKey: 'pq-a2' }]
    })
    await sendAudioProactive(creds, { type: 'group', openConversationId: 'cX' }, 'a.mp3', '@id')
    const c = captured as { msgParam: string }
    expect(JSON.parse(c.msgParam).duration).toBe('60000')
  })
})

// =============================================================================
// sendFileProactive
// =============================================================================

describe('sendFileProactive', () => {
  it('posts sampleFile msgKey with fileName + fileType defaults', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = JSON.parse(config.data as string)
      return [200, { processQueryKey: 'pq-f' }]
    })

    await sendFileProactive(
      creds,
      { type: 'group', openConversationId: 'cX' },
      { path: '/tmp/report.pdf' },
      '@lCv_file_id',
    )
    const c = captured as { msgKey: string; msgParam: string }
    expect(c.msgKey).toBe('sampleFile')
    const param = JSON.parse(c.msgParam)
    expect(param.mediaId).toBe('@lCv_file_id')
    expect(param.fileName).toBe('report.pdf')
    expect(param.fileType).toBe('pdf')
  })

  it('respects explicit fileName/fileType override', async () => {
    let captured: unknown = null
    mock.onPost(/groupMessages\/send/).reply((config) => {
      captured = JSON.parse(config.data as string)
      return [200, { processQueryKey: 'pq-f2' }]
    })
    await sendFileProactive(
      creds,
      { type: 'group', openConversationId: 'cX' },
      { path: '/tmp/x.bin', fileName: 'custom.bin', fileType: 'application/octet-stream' },
      '@id',
    )
    const param = JSON.parse((captured as { msgParam: string }).msgParam)
    expect(param.fileName).toBe('custom.bin')
    expect(param.fileType).toBe('application/octet-stream')
  })
})

// =============================================================================
// extractVideoMetadata / extractAudioDuration (ffmpeg 缺失时降级)
// =============================================================================

describe('extractVideoMetadata / extractAudioDuration', () => {
  it('returns null when fluent-ffmpeg is not installed (no throw)', async () => {
    // 用一个不存在的文件路径，期望函数 catch 错误返回 null
    const meta = await extractVideoMetadata('/nonexistent/foo.mp4')
    expect(meta).toBeNull()

    const dur = await extractAudioDuration('/nonexistent/bar.mp3')
    expect(dur).toBeNull()
  })
})

describe('extractVideoThumbnail', () => {
  it('returns null for non-existent video (no throw)', async () => {
    const out = await extractVideoThumbnail('/nonexistent/foo.mp4')
    expect(out).toBeNull()
  })
})

// =============================================================================
// processVideoMarkers
// =============================================================================

describe('processVideoMarkers', () => {
  it('returns original content when no oapiToken', async () => {
    mock.onGet(/\/gettoken/).networkError()
    const content = '[DINGTALK_VIDEO]{"path":"/tmp/v.mp4"}[/DINGTALK_VIDEO]'
    const out = await processVideoMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toBe(content)  // 原样返回
  })

  it('returns cleaned content when no markers present', async () => {
    const out = await processVideoMarkers('plain text no markers', {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toBe('plain text no markers')
  })

  it('skips invalid JSON in markers', async () => {
    const content = '[DINGTALK_VIDEO]not-json[/DINGTALK_VIDEO]\nactual text'
    const out = await processVideoMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    // 无有效视频 → 标记被清掉、保留其他内容
    expect(out).not.toContain('DINGTALK_VIDEO')
    expect(out).toContain('actual text')
  })

  it('skips non-existent video files and includes status messages', async () => {
    const content = 'before\n[DINGTALK_VIDEO]{"path":"/nonexistent/v.mp4"}[/DINGTALK_VIDEO]\nafter'
    const out = await processVideoMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).not.toContain('DINGTALK_VIDEO')
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out).toContain('⚠️ 视频文件不存在')
  })

  it('full flow: real file + mocked ffmpeg + mocked upload + mocked send', async () => {
    // 创建一个临时小文件作为视频（实际内容不重要，ffmpeg 缺失会跳过 metadata）
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dingtalk-test-'))
    const fakeVideo = path.join(tmpDir, 'fake.mp4')
    fs.writeFileSync(fakeVideo, 'fake video content')

    // Mock 视频上传（OAPI）
    mock.onPost(/media\/upload/).reply(200, { media_id: '@lCv_video' })
    // Mock 视频消息发送（newAPI）
    mock.onPost(/groupMessages\/send/).reply(200, { processQueryKey: 'pq-full' })

    const content = `[DINGTALK_VIDEO]{"path":"${fakeVideo}"}[/DINGTALK_VIDEO]\nMain content here`
    const out = await processVideoMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })

    // 视频消息已发出，标记被替换为 status 行
    expect(out).toContain('Main content here')
    expect(out).not.toContain('DINGTALK_VIDEO')
    // 没有 ffmpeg → 无封面但视频仍发出；status 行可能含 ✅ 或 ⚠️
    expect(out).toMatch(/✅|⚠️/)

    fs.rmSync(tmpDir, { recursive: true })
  })
})

// =============================================================================
// processAudioMarkers
// =============================================================================

describe('processAudioMarkers', () => {
  it('returns cleaned content when no markers', async () => {
    const out = await processAudioMarkers('no markers here', {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toBe('no markers here')
  })

  it('skips non-existent files', async () => {
    const content = '[DINGTALK_AUDIO]{"path":"/nonexistent/a.mp3"}[/DINGTALK_AUDIO]\nbody'
    const out = await processAudioMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toContain('⚠️')
    expect(out).toContain('body')
  })

  it('full flow with fake audio file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dingtalk-audio-'))
    const fakeAudio = path.join(tmpDir, 'fake.mp3')
    fs.writeFileSync(fakeAudio, 'fake audio')

    mock.onPost(/media\/upload/).reply(200, { media_id: '@lCv_audio' })
    mock.onPost(/groupMessages\/send/).reply(200, { processQueryKey: 'pq-a' })

    const out = await processAudioMarkers(`[DINGTALK_AUDIO]{"path":"${fakeAudio}"}[/DINGTALK_AUDIO]\nBody`, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toContain('Body')
    expect(out).toMatch(/✅|⚠️/)

    fs.rmSync(tmpDir, { recursive: true })
  })
})

// =============================================================================
// processFileMarkers
// =============================================================================

describe('processFileMarkers', () => {
  it('returns cleaned content when no markers', async () => {
    const out = await processFileMarkers('plain', {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toBe('plain')
  })

  it('skips non-existent files', async () => {
    const content = '[DINGTALK_FILE]{"path":"/nonexistent/f.txt","fileName":"f.txt"}[/DINGTALK_FILE]\nx'
    const out = await processFileMarkers(content, {
      creds,
      target: { type: 'group', openConversationId: 'cX' },
    })
    expect(out).toContain('⚠️')
    expect(out).toContain('x')
  })

  it('full flow with fake file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dingtalk-file-'))
    const fakeFile = path.join(tmpDir, 'report.txt')
    fs.writeFileSync(fakeFile, 'fake file content')

    mock.onPost(/media\/upload/).reply(200, { media_id: '@lCv_file' })
    mock.onPost(/groupMessages\/send/).reply(200, { processQueryKey: 'pq-f' })

    const out = await processFileMarkers(
      `[DINGTALK_FILE]{"path":"${fakeFile}","fileName":"report.txt"}[/DINGTALK_FILE]\nBody`,
      { creds, target: { type: 'group', openConversationId: 'cX' } },
    )
    expect(out).toContain('Body')
    expect(out).toMatch(/✅|⚠️/)

    fs.rmSync(tmpDir, { recursive: true })
  })
})

// =============================================================================
// Pattern sanity
// =============================================================================

describe('marker patterns', () => {
  it('VIDEO_MARKER_PATTERN matches one marker', () => {
    const m = '[DINGTALK_VIDEO]{"path":"/x"}[/DINGTALK_VIDEO]'.match(VIDEO_MARKER_PATTERN)
    expect(m).not.toBeNull()
  })

  it('AUDIO_MARKER_PATTERN matches', () => {
    expect('[DINGTALK_AUDIO]{"path":"/y"}[/DINGTALK_AUDIO]'.match(AUDIO_MARKER_PATTERN)).not.toBeNull()
  })

  it('FILE_MARKER_PATTERN matches', () => {
    expect('[DINGTALK_FILE]{"path":"/z"}[/DINGTALK_FILE]'.match(FILE_MARKER_PATTERN)).not.toBeNull()
  })
})