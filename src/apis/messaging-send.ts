/**
 * Webhook-based message sending (text / markdown / link).
 *
 * Fork 自上游 connector 的 services/messaging/send.ts。去掉 DINGTALK_API 常量
 * 直接 import，改用本仓库 messaging-types.ts。
 *
 * 适用场景：
 *   - 群机器人自定义 webhook（在钉钉群里"添加机器人"时拿到的 URL）
 *   - 本仓库首版不直接消费 webhook 路径（group message 走的是 /v1.0/robot/groupMessages/send），
 *     但保留以备"群内非机器人对话"或测试场景使用。
 */

import type { ResolvedDingtalkCredentials } from '../types.js'
import { DINGTALK_API } from './messaging-types.js'
import { getAccessToken } from './tokens.js'
import { getDingtalkHttpClient } from '../utils/http-client.js'
import type { DingTalkMsgType, ProactiveSendOptions } from './messaging-types.js'

// =============================================================================
// 单条 webhook 发送（text / markdown / link）
// =============================================================================

/**
 * 发送 Markdown 消息
 */
export async function sendMarkdownMessage(
  creds: ResolvedDingtalkCredentials,
  sessionWebhook: string,
  title: string,
  markdown: string,
  options: ProactiveSendOptions = {},
): Promise<unknown> {
  const token = await getAccessToken(creds)
  let text = markdown

  if (options.atUserIds?.length) {
    for (const id of options.atUserIds) {
      if (!text.includes(`@${id}`)) text = `${text} @${id}`
    }
  }
  if (options.atDingtalkIds?.length) {
    for (const id of options.atDingtalkIds) {
      if (!text.includes(`@${id}`)) text = `${text} @${id}`
    }
  }

  const body: Record<string, unknown> = {
    msgtype: 'markdown',
    markdown: { title: title || 'Message', text },
  }

  const atUserIds = options.atUserIds ?? []
  const atDingtalkIds = options.atDingtalkIds ?? []
  if (atUserIds.length > 0 || atDingtalkIds.length > 0) {
    body.at = {
      ...(atUserIds.length > 0 ? { atUserIds } : {}),
      ...(atDingtalkIds.length > 0 ? { atDingtalkIds } : {}),
      isAtAll: options.atAll ?? false,
    }
  }

  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
  const resp = await http.post(sessionWebhook, body, {
    headers: {
      'x-acs-dingtalk-access-token': token,
      'Content-Type': 'application/json',
    },
  })
  return resp.data
}

/**
 * 发送文本消息
 */
export async function sendTextMessage(
  creds: ResolvedDingtalkCredentials,
  sessionWebhook: string,
  content: string,
  options: ProactiveSendOptions = {},
): Promise<unknown> {
  const token = await getAccessToken(creds)
  let text = content
  if (options.atUserIds?.length) {
    for (const id of options.atUserIds) {
      if (!text.includes(`@${id}`)) text = `${text} @${id}`
    }
  }
  if (options.atDingtalkIds?.length) {
    for (const id of options.atDingtalkIds) {
      if (!text.includes(`@${id}`)) text = `${text} @${id}`
    }
  }
  const body: Record<string, unknown> = {
    msgtype: 'text',
    text: { content: text },
  }
  const atUserIds = options.atUserIds ?? []
  const atDingtalkIds = options.atDingtalkIds ?? []
  if (atUserIds.length > 0 || atDingtalkIds.length > 0) {
    body.at = {
      ...(atUserIds.length > 0 ? { atUserIds } : {}),
      ...(atDingtalkIds.length > 0 ? { atDingtalkIds } : {}),
      isAtAll: options.atAll ?? false,
    }
  }
  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
  const resp = await http.post(sessionWebhook, body, {
    headers: {
      'x-acs-dingtalk-access-token': token,
      'Content-Type': 'application/json',
    },
  })
  return resp.data
}

/**
 * 发送链接消息
 */
export async function sendLinkMessage(
  creds: ResolvedDingtalkCredentials,
  sessionWebhook: string,
  params: {
    title: string
    text: string
    picUrl?: string
    messageUrl: string
  },
): Promise<unknown> {
  const token = await getAccessToken(creds)
  const body = {
    msgtype: 'link',
    link: {
      title: params.title,
      text: params.text,
      picUrl: params.picUrl,
      messageUrl: params.messageUrl,
    },
  }
  const http = getDingtalkHttpClient({ baseURL: DINGTALK_API })
  const resp = await http.post(sessionWebhook, body, {
    headers: {
      'x-acs-dingtalk-access-token': token,
      'Content-Type': 'application/json',
    },
  })
  return resp.data
}

/**
 * 智能选择 text / markdown
 *
 * 启发式：内容含换行、Markdown 语法字符（#*`-_[]）就视为 markdown。
 */
export async function sendMessage(
  creds: ResolvedDingtalkCredentials,
  sessionWebhook: string,
  text: string,
  options: ProactiveSendOptions = {},
): Promise<unknown> {
  const hasMarkdown =
    /^[#*>-]|[*_`#\[\]]/.test(text) ||
    (typeof text === 'string' && text.includes('\n'))
  const useMarkdown = options.msgType
    ? options.msgType === 'markdown'
    : hasMarkdown

  if (useMarkdown) {
    const title =
      options.title ||
      (text ?? '')
        .split('\n')[0]
        .replace(/^[#*\s\->]+/, '')
        .slice(0, 20) ||
      'Message'
    return sendMarkdownMessage(creds, sessionWebhook, title, text, options)
  }
  return sendTextMessage(creds, sessionWebhook, text, options)
}

// =============================================================================
// msgKey/msgParam 构造（用于 batchSend / groupMessages/send）
// =============================================================================

/**
 * 把 msgType + content + at 信息打包成钉钉 batchSend 需要的 msgKey + msgParam。
 *
 * 上游同名函数，本仓库去掉了 mentions.ts 的多机器人协作部分。
 */
export function buildMsgPayload(
  msgType: DingTalkMsgType,
  content: string,
  title?: string,
  atOptions?: { atDingtalkIds?: string[]; atUserIds?: string[]; atAll?: boolean },
):
  | { msgKey: string; msgParam: Record<string, unknown> }
  | { error: string } {
  const appendAtMentions = (raw: string): string => {
    if (!atOptions) return raw
    let out = raw ?? ''
    const ids = [...(atOptions.atDingtalkIds || []), ...(atOptions.atUserIds || [])]
    for (const id of ids) {
      if (id && !out.includes(`@${id}`)) out = `${out} @${id}`
    }
    if (atOptions.atAll && !out.includes('@all')) out = `${out} @all`
    return out
  }

  switch (msgType) {
    case 'markdown': {
      const text = appendAtMentions(content)
      return {
        msgKey: 'sampleMarkdown',
        msgParam: {
          title:
            title ||
            (content ?? '')
              .split('\n')[0]
              .replace(/^[#*\s\->]+/, '')
              .slice(0, 20) ||
            'Message',
          text,
        },
      }
    }
    case 'link': {
      try {
        return {
          msgKey: 'sampleLink',
          msgParam: typeof content === 'string' ? JSON.parse(content) : (content as Record<string, unknown>),
        }
      } catch {
        return { error: 'Invalid link message format, expected JSON' }
      }
    }
    case 'actionCard': {
      try {
        return {
          msgKey: 'sampleActionCard',
          msgParam: typeof content === 'string' ? JSON.parse(content) : (content as Record<string, unknown>),
        }
      } catch {
        return { error: 'Invalid actionCard message format, expected JSON' }
      }
    }
    case 'image':
      return {
        msgKey: 'sampleImageMsg',
        msgParam: { photoURL: content },
      }
    case 'text':
    default: {
      const finalContent = appendAtMentions(content)
      return {
        msgKey: 'sampleText',
        msgParam: { content: finalContent },
      }
    }
  }
}