/**
 * Tool: dingtalk_send
 *
 * 让 DSH agent 向指定钉钉 conversationId 发送文本 / Markdown / Image 消息。
 * 协议层走 apis/messaging.sendToGroup / sendToUser（fork 自上游 connector）。
 *
 * 目标约定：
 *   - conversationType='1'（私聊）：conversationId 是 senderStaffId
 *   - conversationType='2'（群）：   conversationId 是 openConversationId
 *
 * 高级选项：
 *   - atStaffIds: @成员列表（视觉渲染为蓝色 @）
 *   - msgType: text / markdown / image（image 时 text 字段承载 mediaId）
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { createLogger } from '../utils/logger.js'
import { sendToGroup, sendToUser, type SendResult } from '../apis/messaging.js'

const log = createLogger('dingtalk-tool-send')

function getCreds() {
  const cid = process.env.DINGTALK_CLIENT_ID
  const csec = process.env.DINGTALK_CLIENT_SECRET
  if (!cid || !csec) {
    throw new Error(
      'dingtalk_send requires DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET env vars',
    )
  }
  return { clientId: cid, clientSecret: csec }
}

export function createSendTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_send',
    description:
      '向指定钉钉会话发送文本/Markdown/图片消息。优先 AI Card 流式；失败降级普通消息。支持 @成员。',
    input: {
      schema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: '钉钉会话 ID（私聊为 senderStaffId，群为 openConversationId）',
          },
          conversationType: {
            type: 'string',
            enum: ['1', '2'],
            description: "'1'=私聊, '2'=群",
            default: '2',
          },
          text: {
            type: 'string',
            description: '消息内容。msgType=markdown 时支持 Markdown 语法；msgType=image 时传 media_id',
          },
          msgType: {
            type: 'string',
            enum: ['text', 'markdown', 'image'],
            default: 'markdown',
          },
          atStaffIds: {
            type: 'array',
            items: { type: 'string' },
            description: '@的成员 staffId 列表',
          },
          atAll: {
            type: 'boolean',
            default: false,
            description: '是否 @all',
          },
          title: {
            type: 'string',
            description: 'Markdown 标题（可选）',
          },
        },
        required: ['conversationId', 'text'],
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
    timeoutMs: 30_000,
    async execute(args: {
      conversationId: string
      conversationType: '1' | '2'
      text: string
      msgType: 'text' | 'markdown' | 'image'
      atStaffIds?: string[]
      atAll?: boolean
      title?: string
    }): Promise<SendResult> {
      const creds = getCreds()
      const opts = {
        msgType: args.msgType,
        title: args.title,
        atUserIds: args.atStaffIds,
        atAll: args.atAll,
      }
      try {
        if (args.conversationType === '1') {
          return await sendToUser(creds, args.conversationId, args.text, opts)
        }
        return await sendToGroup(creds, args.conversationId, args.text, opts)
      } catch (err) {
        log.error('dingtalk_send failed', err)
        return { ok: false, error: (err as Error).message, usedAICard: false }
      }
    },
  }
}