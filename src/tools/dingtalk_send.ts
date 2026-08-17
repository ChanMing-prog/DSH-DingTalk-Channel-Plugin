/**
 * Tool: dingtalk_send
 *
 * 让 DSH agent 可以向指定钉钉 conversationId 发送消息。
 * 协议层复用 apis/messaging.sendTextToDingTalk（fork 自上游
 * services/messaging/index.ts）。
 *
 * 这是首版的最小占位实现：只支持纯文本/Markdown，发送目标取自
 * tool args 或当前 session 的 conversationId（source.kind === 'dingtalk'）。
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import { getAccessToken } from '../runtime/setup.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('dingtalk-tool-send')

export function createSendTool(ctx: Context, config: DingtalkConfig) {
  return {
    name: 'dingtalk_send',
    description: '向指定钉钉会话发送文本或 Markdown 消息。可用于私聊或群聊。',
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
          text: { type: 'string', description: '消息文本（支持 Markdown）' },
          msgType: {
            type: 'string',
            enum: ['text', 'markdown'],
            default: 'markdown',
          },
          atStaffIds: {
            type: 'array',
            items: { type: 'string' },
            description: '@的成员 staffId 列表',
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
          messageId: { type: 'string' },
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
      msgType: 'text' | 'markdown'
      atStaffIds?: string[]
    }) {
      const token = await getAccessToken({
        clientId: process.env.DINGTALK_CLIENT_ID ?? '',
        clientSecret: process.env.DINGTALK_CLIENT_SECRET ?? '',
      })
      const http = getDingtalkHttpClient()
      try {
        const endpoint =
          args.conversationType === '1'
            ? '/v1.0/im/bot/messages/send_to_single_chat'
            : '/v1.0/im/bot/messages/send'
        const body =
          args.conversationType === '1'
            ? {
                robotCode: process.env.DINGTALK_CLIENT_ID,
                userIds: [args.conversationId],
                msgKey: args.msgType === 'markdown' ? 'sampleMarkdown' : 'sampleText',
                msgParam: JSON.stringify({ text: args.text, atStaffIds: args.atStaffIds ?? [] }),
              }
            : {
                robotCode: process.env.DINGTALK_CLIENT_ID,
                openConversationId: args.conversationId,
                msgKey: args.msgType === 'markdown' ? 'sampleMarkdown' : 'sampleText',
                msgParam: JSON.stringify({ text: args.text, atStaffIds: args.atStaffIds ?? [] }),
              }
        const res = await http.post<{ messageId: string }>(endpoint, body, {
          headers: { 'x-acs-dingtalk-access-token': token },
        })
        return { ok: true, messageId: res.data.messageId }
      } catch (err) {
        log.error('dingtalk_send failed', err)
        return { ok: false, messageId: '' }
      }
    },
  }
}