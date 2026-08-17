/**
 * Tool: dingtalk_send_media
 *
 * 让 DSH agent 发送本地媒体文件（图片/视频/音频/文件）到钉钉。
 * 协议层走 apis/messaging.sendMediaToDingTalk。
 *
 * 自动处理：
 *   - 文件扩展名 → 媒体类型（image/video/voice/file）
 *   - 上传到钉钉 OAPI（拿到 media_id）
 *   - 图片直接用 sampleImageMsg 发送
 *   - 视频/音频/文件由 PR-3 完善（当前返回 success 占位 + media_id）
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { sendMediaToDingTalk, type SendResult } from '../apis/messaging.js'

function getCreds() {
  const cid = process.env.DINGTALK_CLIENT_ID
  const csec = process.env.DINGTALK_CLIENT_SECRET
  if (!cid || !csec) {
    throw new Error(
      'dingtalk_send_media requires DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET env vars',
    )
  }
  return { clientId: cid, clientSecret: csec }
}

export function createSendMediaTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_send_media',
    description:
      '向指定钉钉会话发送本地媒体文件（图片/视频/音频/文件）。自动上传 + 类型分发。',
    input: {
      schema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          conversationType: { type: 'string', enum: ['1', '2'], default: '2' },
          mediaUrl: {
            type: 'string',
            description: '媒体文件路径（本地绝对路径 / 相对路径 / file:// URI）',
          },
          text: {
            type: 'string',
            description: '可选的伴随文本（先发文本再发媒体）',
          },
          mediaLocalRoots: {
            type: 'array',
            items: { type: 'string' },
            description: '相对路径搜索根',
          },
        },
        required: ['conversationId', 'mediaUrl'],
      },
      render(_args: unknown, value: unknown) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          processQueryKey: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['ok'],
      },
      render(_args: unknown, value: unknown) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    timeoutMs: 60_000,
    async execute(args: {
      conversationId: string
      conversationType: '1' | '2'
      mediaUrl: string
      text?: string
      mediaLocalRoots?: string[]
    }): Promise<SendResult> {
      const creds = getCreds()
      const target = args.conversationType === '1'
        ? `user:${args.conversationId}`
        : args.conversationId.startsWith('cid')
          ? args.conversationId
          : `group:${args.conversationId}`

      return sendMediaToDingTalk({
        creds,
        target,
        text: args.text,
        mediaUrl: args.mediaUrl,
        mediaLocalRoots: args.mediaLocalRoots,
      })
    },
  }
}