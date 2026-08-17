/**
 * DingTalk Stream Bridge
 *
 * 把 dingtalk-stream 长连接接到的入站消息翻译为 DSH agent inbox 调用。
 *
 * 流程：
 *   1. dingtalk-stream 收到 callback 数据
 *   2. 解析成 DingtalkInboundMessage
 *   3. 按 conversationId + sessionScope 映射成稳定 SessionId
 *   4. 查 / 创建 AgentHandle（ctx.agents.create 或 resume）
 *   5. 把消息包装成 DingtalkAgentMessage，通过 handle.followup 灌入 inbox
 *   6. 订阅 handle.session 的 assistant/chunk 事件，转发给 AI Card 流式
 *   7. 等 idle 后解绑订阅
 *
 * 这个文件是上游 connector 的 core/provider.ts + services/card-bridge.ts 的
 * "DSH 重写版"：保留协议层、把 OpenClaw 依赖换成 cordis。
 */

import type { Context } from 'cordis'
import { DingtalkConfigSchema, type DingtalkConfig } from '../../settings-schema.js'
import {
  type BridgeContext,
  type DingtalkInboundMessage,
  type DingtalkAgentMessage,
  type SessionRouting,
  type AiCardInstance,
} from '../types.js'
import { createLogger } from '../utils/logger.js'
import { resolveCredentials } from './setup.js'
import { routeSession } from './session-routing.js'
import { createOrResumeAgentHandle } from './session-routing.js'
import { createAiCard, appendAiCardChunk, completeAiCard, failAiCard } from './ai-card.js'
import { handleMessagePolicy } from './policy.js'

const log = createLogger('dingtalk-stream')

/**
 * 启动 stream bridge。
 * 返回 dispose 函数，调用后停止订阅。
 */
export function startDingtalkStreamBridge(
  ctx: Context,
  rawConfig: unknown,
  credentials: { clientId: string; clientSecret: string },
): () => void {
  const parse = DingtalkConfigSchema.safeParse(rawConfig)
  if (!parse.success) {
    throw new Error(`invalid stream config: ${parse.error.message}`)
  }
  const config = parse.data

  // 暴露 ctx 给 setup 模块（resolveCredentials 内部用）
  ;(globalThis as { __dsh_ctx?: Context }).__dsh_ctx = ctx

  const bridgeCtx: BridgeContext = {
    ctx,
    config,
    credentials: { ...credentials },
    handleCache: new Map(),
    cardCache: new Map(),
    cardRealCache: new Map(),
    pairedStaffIds: new Set(),
  }

  // 动态 import dingtalk-stream 以避免启动期硬依赖
  let client: { registerCallbackListener: (l: unknown) => void; start: () => Promise<void>; close: () => void } | null = null

  void (async () => {
    try {
      // @ts-expect-error - 运行时才有此模块
      const stream = await import('dingtalk-stream')
      const CardReplier = stream.CardReplier || stream.default?.CardReplier
      const ChatBotHandler = stream.ChatBotHandler || stream.default?.ChatBotHandler
      const DWClient = stream.DWClient || stream.default?.DWClient

      if (!DWClient) {
        log.error('dingtalk-stream SDK missing DWClient; check installation')
        return
      }

      const dwClient = new DWClient({
        appKey: credentials.clientId,
        appSecret: credentials.clientSecret,
      })

      const chatBotHandler = ChatBotHandler
        ? new ChatBotHandler({ dwClient })
        : null
      if (chatBotHandler) {
        // 注册"消息类"回调
        dwClient.registerCallbackListener(
          '/v1.0/im/bot/messages/get',
          (res: unknown) => {
            try {
              const msg = parseInboundMessage(res)
              void processInboundMessage(bridgeCtx, msg)
            } catch (err) {
              log.error('failed to handle chat-bot message', err)
            }
          },
        )
        log.info('registered /v1.0/im/bot/messages/get listener')
      }

      if (CardReplier) {
        // 注册 AI Card 回调
        const cardReplier = new CardReplier({ dwClient })
        dwClient.registerCallbackListener('/v1.0/card/instances/create', (res: unknown) => cardReplier.cardInstanceCreated(res))
        dwClient.registerCallbackListener('/v1.0/card/instances/update', (res: unknown) => cardReplier.cardInstanceUpdated(res))
        log.info('registered AI Card listeners')
      }

      await dwClient.start()
      client = dwClient
      log.info('dingtalk-stream client started', { clientId: credentials.clientId })
    } catch (err) {
      log.error('failed to start dingtalk-stream client', err)
    }
  })()

  return () => {
    try {
      client?.close?.()
    } catch (err) {
      log.error('error closing dingtalk-stream client', err)
    }
  }
}

// =============================================================================
// 入站消息解析（钉钉 → DSH 内部）
// =============================================================================

function parseInboundMessage(raw: unknown): DingtalkInboundMessage {
  const r = raw as Record<string, unknown>
  const header = r['headers'] as Record<string, unknown> | undefined
  const data = (r['data'] ?? r) as Record<string, unknown>

  const conversationType = String(data['conversationType'] ?? data['conversation_type'] ?? '1') as '1' | '2'
  const conversationId =
    String(data['openConversationId'] ?? data['conversationId'] ?? data['chatId'] ?? data['senderStaffId'] ?? '')

  const senderStaffId = (data['senderStaffId'] ?? data['senderId']) as string | undefined
  const senderNick = (data['senderNick'] ?? data['sender_nick']) as string | undefined

  const msgType = String(data['msgType'] ?? data['msg_type'] ?? 'text') as DingtalkInboundMessage['msgType']

  const text = (() => {
    if (typeof data['text'] === 'object' && data['text'] !== null) {
      return data['text'] as { content: string }
    }
    if (typeof data['text'] === 'string') {
      return { content: data['text'] }
    }
    if (typeof data['content'] === 'string') {
      // richText 列表形式
      const rich = data['content'] as string
      try {
        const parsed = JSON.parse(rich) as Array<Record<string, unknown>>
        const text2 = parsed.find((p) => p['type'] === 'text') as Record<string, unknown> | undefined
        if (text2 && typeof text2['content'] === 'string') {
          return { content: text2['content'] }
        }
      } catch {
        return { content: rich }
      }
    }
    return undefined
  })()

  return {
    messageId: String(data['messageId'] ?? data['msgId'] ?? header?.['messageId'] ?? crypto.randomUUID()),
    conversationType,
    conversationId,
    openConversationId: (data['openConversationId'] as string | undefined) ?? conversationId,
    senderStaffId,
    senderId: senderStaffId,
    senderNick,
    isInAtList: Boolean(data['isInAtList']),
    text,
    msgType,
    pictureUrl: data['pictureUrl'] as string | undefined,
    audioUrl: data['audioUrl'] as string | undefined,
    fileUrl: data['fileUrl'] as string | undefined,
    videoUrl: data['videoUrl'] as string | undefined,
    raw,
    receivedAt: Date.now(),
  }
}

// =============================================================================
// 消息处理（policy → session route → agent handle → AI card）
// =============================================================================

async function processInboundMessage(bctx: BridgeContext, msg: DingtalkInboundMessage): Promise<void> {
  log.debug('inbound message', { msgType: msg.msgType, conversationId: msg.conversationId })

  // 1. policy 检查（dm/group/allowlist/mention）
  const decision = handleMessagePolicy(bctx, msg)
  if (!decision.accept) {
    log.debug('message rejected by policy', { reason: decision.reason })
    return
  }

  // 2. 路由：conversationId + scope → SessionId + AgentScope
  const routing: SessionRouting = routeSession(bctx, msg)
  log.debug('routing', routing)

  // 3. 创建/恢复 agent handle
  let handle = bctx.handleCache.get(routing.sessionId)
  if (!handle) {
    handle = await createOrResumeAgentHandle(bctx, routing)
    bctx.handleCache.set(routing.sessionId, handle)
  }

  // 4. 创建 AI Card（thinking 状态）
  const card = await createAiCard(bctx, msg, routing.sessionId)
  bctx.cardCache.set(routing.sessionId, card)

  // 5. 订阅 session event → 写回 AI Card
  const unsubscribe = subscribeSessionToCard(bctx, handle, card)

  // 6. 把消息灌入 inbox
  const agentMsg = toAgentMessage(msg)
  try {
    handle.followup(agentMsg)
  } catch (err) {
    log.error('followup failed', err)
    failAiCard(bctx, card, err instanceof Error ? err.message : String(err))
    unsubscribe()
    return
  }

  // 7. 等 idle 后解绑（简化：用 awaitIdle 兜底）
  void handle
    .awaitIdle?.()
    ?.then(() => {
      unsubscribe()
      log.debug('handle idle, unsubscribed from session events')
    })
    .catch((err: unknown) => {
      log.error('awaitIdle failed', err)
      unsubscribe()
    })
}

function toAgentMessage(msg: DingtalkInboundMessage): DingtalkAgentMessage {
  const blocks: DingtalkAgentMessage['content'] = []
  if (msg.text?.content) {
    blocks.push({ type: 'text', text: msg.text.content })
  }
  if (msg.pictureUrl) {
    blocks.push({ type: 'image', source: { type: 'url', url: msg.pictureUrl } })
  }
  if (msg.audioUrl) {
    blocks.push({ type: 'audio', source: { type: 'url', url: msg.audioUrl } })
  }
  if (msg.fileUrl) {
    blocks.push({ type: 'file', source: { type: 'url', url: msg.fileUrl }, name: msg.text?.content ?? 'file' })
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: `(empty ${msg.msgType} message)` })
  }
  return {
    role: 'user',
    content: blocks,
    source: {
      kind: 'dingtalk',
      conversationId: msg.conversationId,
      conversationType: msg.conversationType,
      senderStaffId: msg.senderStaffId,
      senderNick: msg.senderNick,
      messageId: msg.messageId,
      receivedAt: msg.receivedAt,
    },
  }
}

function subscribeSessionToCard(
  bctx: BridgeContext,
  handle: import('@deepseek-ai/dsh-agent').AgentHandle,
  card: AiCardInstance,
): () => void {
  // DSH session 事件订阅（参考 @deepseek-ai/dsh-session 的 session/event）
  const session = handle.session as unknown as {
    on: (event: string, listener: (e: unknown) => void) => () => void
  }

  const offChunk = session.on('assistant/chunk', (e: unknown) => {
    const ev = e as { kind?: string; delta?: string }
    if (ev.kind === 'text' && typeof ev.delta === 'string') {
      void appendAiCardChunk(bctx, card, ev.delta)
    }
  })

  const offMessage = session.on('assistant/message', (e: unknown) => {
    const ev = e as { content?: unknown }
    void completeAiCard(bctx, card, ev.content)
  })

  return () => {
    offChunk()
    offMessage()
  }
}