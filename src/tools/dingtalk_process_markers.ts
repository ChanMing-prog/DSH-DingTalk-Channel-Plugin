/**
 * Tool: dingtalk_process_markers
 *
 * 让 DSH agent 可以发"含标记的文本"——agent 写 markdown 内容时插入
 *   [DINGTALK_VIDEO]{"path":"/tmp/v.mp4"}[/DINGTALK_VIDEO]
 *   [DINGTALK_AUDIO]{"path":"/tmp/a.mp3"}[/DINGTALK_AUDIO]
 *   [DINGTALK_FILE]{"path":"/tmp/f.pdf","fileName":"report.pdf"}[/DINGTALK_FILE]
 *
 * 本工具会扫描这些标记 → 上传到钉钉 → 发送独立消息 → 返回清理后的 content
 * （含 status 行）。剩余文本（去掉标记 + 加上 status）作为 AI Card 主内容发出。
 *
 * 适用场景：agent 想给用户发一个"文档 + 视频 + AI Card 总结"的复合包。
 *
 * 这是 PR-3 的标志性便利工具——fork 自上游 processVideoMarkers /
 * processAudioMarkers / processFileMarkers，把它们的能力以 DSH tool 形态暴露。
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { sendToGroup, sendToUser, type SendResult } from '../apis/messaging.js'

function getCreds() {
  const cid = process.env.DINGTALK_CLIENT_ID
  const csec = process.env.DINGTALK_CLIENT_SECRET
  if (!cid || !csec) {
    throw new Error(
      'dingtalk_process_markers requires DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET env vars',
    )
  }
  return { clientId: cid, clientSecret: csec }
}

export function createProcessMarkersTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_process_markers',
    description:
      '发送含 [DINGTALK_VIDEO/AUDIO/FILE] 标记的文本到钉钉。标记会被解析、上传、发送独立消息；剩余文本作为 AI Card 主内容。',
    input: {
      schema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          conversationType: { type: 'string', enum: ['1', '2'], default: '2' },
          content: {
            type: 'string',
            description: '含 [DINGTALK_VIDEO|AUDIO|FILE] 标记的文本',
          },
          msgType: {
            type: 'string',
            enum: ['text', 'markdown'],
            default: 'markdown',
          },
        },
        required: ['conversationId', 'content'],
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
          usedAICard: { type: 'boolean' },
          cardInstanceId: { type: 'string' },
          processQueryKey: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['ok'],
      },
      render(_args: unknown, value: unknown) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    timeoutMs: 120_000,
    async execute(args: {
      conversationId: string
      conversationType: '1' | '2'
      content: string
      msgType: 'text' | 'markdown'
    }): Promise<SendResult> {
      const creds = getCreds()
      const opts = { msgType: args.msgType }
      try {
        if (args.conversationType === '1') {
          return await sendToUser(creds, args.conversationId, args.content, opts)
        }
        return await sendToGroup(creds, args.conversationId, args.content, opts)
      } catch (err) {
        return { ok: false, error: (err as Error).message, usedAICard: false }
      }
    },
  }
}