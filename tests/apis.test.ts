/**
 * Tests for apis/messaging + apis/media — covers pure-function layers and
 * target-string parsing. Mocks HTTP via axios-mock-adapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { parseTargetString } from '../src/apis/messaging.js'
import { buildMsgPayload, sendMarkdownMessage, sendTextMessage } from '../src/apis/messaging-send.js'
import { fixNewlines, normalizeForCard } from '../src/apis/messaging-ai-card.js'
import { processLocalImages, toLocalPath, extractVideoMarkers, extractFileMarkers } from '../src/apis/media.js'
import { clearTokenCache } from '../src/apis/tokens.js'
import { LOCAL_IMAGE_RE, IMAGE_EXTENSIONS, VIDEO_MARKER_PATTERN } from '../src/apis/media.js'

const mock = new MockAdapter(axios, { onNoMatch: 'passthrough' })

beforeEach(() => {
  mock.reset()
  clearTokenCache()
  // 默认 token 拉取
  mock.onPost('https://api.dingtalk.com/v1.0/oauth2/accessToken').reply(200, {
    accessToken: 'fake-token',
    expireIn: 7200,
  })
})

const creds = { clientId: 'cid', clientSecret: 'csec' }

// =============================================================================
// parseTargetString
// =============================================================================

describe('parseTargetString', () => {
  it('"group:xxx" → group target', () => {
    expect(parseTargetString('group:cXXXXXX')).toEqual({ type: 'group', openConversationId: 'cXXXXXX' })
  })

  it('"user:xxx" → user target', () => {
    expect(parseTargetString('user:staffA')).toEqual({ type: 'user', userId: 'staffA' })
  })

  it('"cidXXXX" → group target', () => {
    expect(parseTargetString('cidABC123')).toEqual({ type: 'group', openConversationId: 'cidABC123' })
  })

  it('plain id → user target (fallback)', () => {
    expect(parseTargetString('staffA')).toEqual({ type: 'user', userId: 'staffA' })
  })
})

// =============================================================================
// buildMsgPayload
// =============================================================================

describe('buildMsgPayload', () => {
  it('markdown with atUserIds appends @<id>', () => {
    const result = buildMsgPayload('markdown', 'Hello', undefined, { atUserIds: ['staffA'] })
    expect('msgKey' in result).toBe(true)
    if ('msgKey' in result) {
      expect(result.msgKey).toBe('sampleMarkdown')
      const param = result.msgParam as { text: string; title: string }
      expect(param.text).toContain('@staffA')
    }
  })

  it('text default', () => {
    const result = buildMsgPayload('text', 'hi')
    if ('msgKey' in result) {
      expect(result.msgKey).toBe('sampleText')
      expect((result.msgParam as { content: string }).content).toBe('hi')
    }
  })

  it('image → sampleImageMsg + photoURL', () => {
    const result = buildMsgPayload('image', 'https://example.com/img.png')
    if ('msgKey' in result) {
      expect(result.msgKey).toBe('sampleImageMsg')
      expect((result.msgParam as { photoURL: string }).photoURL).toBe('https://example.com/img.png')
    }
  })

  it('link invalid JSON → error', () => {
    const result = buildMsgPayload('link', 'not-json')
    expect('error' in result).toBe(true)
  })

  it('atAll → @all appended', () => {
    const result = buildMsgPayload('text', 'hi', undefined, { atAll: true })
    if ('msgKey' in result) {
      expect((result.msgParam as { content: string }).content).toContain('@all')
    }
  })
})

// =============================================================================
// Markdown fixNewlines / normalizeForCard
// =============================================================================

describe('fixNewlines', () => {
  it('single \\n → <br> in plain text', () => {
    expect(fixNewlines('hello\nworld')).toContain('<br>')
  })

  it('code block preserves \\n', () => {
    const out = fixNewlines('```\nline1\nline2\n```')
    expect(out).toContain('line1\nline2')
  })

  it('list items keep \\n separator', () => {
    const out = fixNewlines('- item1\n- item2')
    expect(out).toContain('\n')
  })

  it('CRLF normalized to LF', () => {
    const out = fixNewlines('hello\r\nworld')
    expect(out).not.toContain('\r')
  })
})

describe('normalizeForCard', () => {
  it('handles markdown table without preceding blank line', () => {
    const input = 'Some intro\n| A | B |\n|---|---|\n| 1 | 2 |'
    const out = normalizeForCard(input)
    expect(out).toContain('\n\n')  // 加了空行
  })
})

// =============================================================================
// sendTextMessage / sendMarkdownMessage (with mocked axios)
// =============================================================================

describe('sendTextMessage (webhook)', () => {
  it('posts text body to webhook', async () => {
    let captured: unknown = null
    mock.onPost(/.*/).reply((config) => {
      captured = { url: config.url, body: config.data }
      return [200, { errcode: 0 }]
    })

    await sendTextMessage(creds, 'https://oapi.dingtalk.com/robot/send?access_token=x', 'hello')

    const c = captured as { url: string; body: { msgtype: string; text: { content: string } } }
    expect(c.body.msgtype).toBe('text')
    expect(c.body.text.content).toBe('hello')
  })
})

describe('sendMarkdownMessage (webhook)', () => {
  it('posts markdown body with @mention', async () => {
    let captured: unknown = null
    mock.onPost(/.*/).reply((config) => {
      captured = { url: config.url, body: config.data }
      return [200, { errcode: 0 }]
    })

    await sendMarkdownMessage(
      creds,
      'https://oapi.dingtalk.com/robot/send?access_token=x',
      'title',
      'body',
      { atUserIds: ['staffA'] },
    )

    const c = captured as { body: { msgtype: string; markdown: { text: string }; at: { atUserIds: string[] } } }
    expect(c.body.msgtype).toBe('markdown')
    expect(c.body.markdown.text).toContain('body')
    expect(c.body.markdown.text).toContain('@staffA')
    expect(c.body.at.atUserIds).toEqual(['staffA'])
  })
})

// =============================================================================
// media.ts utilities
// =============================================================================

describe('toLocalPath', () => {
  it('strips file:// prefix', () => {
    expect(toLocalPath('file:///tmp/x.png')).toBe('/tmp/x.png')
  })

  it('strips MEDIA: prefix', () => {
    expect(toLocalPath('MEDIA:/tmp/x.png')).toBe('/tmp/x.png')
  })

  it('decodes URL encoding', () => {
    expect(toLocalPath('/tmp/%E5%9B%BE.png')).toBe('/tmp/图.png')
  })

  it('passes through plain paths', () => {
    expect(toLocalPath('/tmp/x.png')).toBe('/tmp/x.png')
  })
})

describe('LOCAL_IMAGE_RE', () => {
  it('matches markdown image with file://', () => {
    const md = '![alt](file:///tmp/x.png)'
    expect([...md.matchAll(LOCAL_IMAGE_RE)].length).toBe(1)
  })

  it('matches markdown image with /Users path', () => {
    const md = '![alt](/Users/foo/x.png)'
    expect([...md.matchAll(LOCAL_IMAGE_RE)].length).toBe(1)
  })
})

describe('VIDEO_MARKER_PATTERN + extractVideoMarkers', () => {
  it('extracts JSON body from markers', () => {
    const content = 'before\n[DINGTALK_VIDEO]{"path":"/tmp/v.mp4"}[/DINGTALK_VIDEO]\nafter'
    const { text, videos } = extractVideoMarkers(content)
    expect(videos).toHaveLength(1)
    expect(videos[0].path).toBe('/tmp/v.mp4')
    expect(text).not.toContain('DINGTALK_VIDEO')
    expect(text).toContain('before')
    expect(text).toContain('after')
  })

  it('ignores invalid JSON', () => {
    const content = '[DINGTALK_VIDEO]not-json[/DINGTALK_VIDEO]'
    const { videos } = extractVideoMarkers(content)
    expect(videos).toHaveLength(0)
  })
})

describe('extractFileMarkers', () => {
  it('parses file info', () => {
    const content = '[DINGTALK_FILE]{"path":"/tmp/a.txt","fileName":"a.txt"}[/DINGTALK_FILE]'
    const { files } = extractFileMarkers(content)
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('a.txt')
  })
})

describe('IMAGE_EXTENSIONS regex', () => {
  it('matches image extensions', () => {
    expect(IMAGE_EXTENSIONS.test('a.png')).toBe(true)
    expect(IMAGE_EXTENSIONS.test('a.JPG')).toBe(true)
    expect(IMAGE_EXTENSIONS.test('a.txt')).toBe(false)
  })
})

// =============================================================================
// processLocalImages (mocked oapi)
// =============================================================================

describe('processLocalImages', () => {
  it('returns input unchanged when no oapiToken', async () => {
    const out = await processLocalImages('hello', null)
    expect(out).toBe('hello')
  })

  it('returns input unchanged when no images', async () => {
    const out = await processLocalImages('plain text', 'token-x')
    expect(out).toBe('plain text')
  })

  it('skips non-existent files and keeps original', async () => {
    const md = '![x](/nonexistent/foo.png)'
    const out = await processLocalImages(md, 'token-x')
    // 上传失败时保留原 markdown（不抛错）
    expect(out).toBe(md)
  })
})

// =============================================================================
// clearTokenCache sanity
// =============================================================================

describe('token cache', () => {
  it('clearTokenCache does not throw', () => {
    expect(() => clearTokenCache()).not.toThrow()
  })
})