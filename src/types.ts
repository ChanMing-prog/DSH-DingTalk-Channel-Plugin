/**
 * DSH DingTalk Plugin — Type Definitions
 *
 * 与上游 connector 的 types/index.ts 对齐，但剥离 OpenClaw 依赖。
 */

import type { DingtalkConfig } from '../settings-schema.js'

// =============================================================================
// 钉钉开放平台身份
// =============================================================================

export interface ResolvedDingtalkCredentials {
  clientId: string
  clientSecret: string
  // 上游 connector 把 accessToken 缓存在每个 accountId 上；这里也照搬
  accessToken?: string
  accessTokenExpiresAt?: number
}

// =============================================================================
// Stream 入站事件（来自 dingtalk-stream SDK）
// =============================================================================

/**
 * 钉钉 stream 回调的入站消息。
 * 字段命名沿用 dingtalk-stream SDK 的约定以减少翻译工作。
 */
export interface DingtalkInboundMessage {
  /** 消息 ID */
  messageId: string
  /** 会话类型 */
  conversationType: '1' | '2'  // '1' = 私聊, '2' = 群
  /** 会话 ID（私聊是 senderStaffId，群是 openConversationId）*/
  conversationId: string
  /** 群聊时的 openConversationId（与 conversationId 同值）*/
  openConversationId?: string
  /** 私聊时的发送者 staffId */
  senderStaffId?: string
  /** 群聊时的发送者 staffId */
  senderId?: string
  /** 发送者昵称 */
  senderNick?: string
  /** 是否 @了机器人 */
  isInAtList?: boolean
  /** 文本内容（纯文本/Markdown）*/
  text?: { content: string }
  /** 消息类型 */
  msgType: 'text' | 'markdown' | 'richText' | 'picture' | 'audio' | 'file' | 'video'
  /** 媒体 URL（图片/音频/视频/文件）*/
  pictureUrl?: string
  audioUrl?: string
  fileUrl?: string
  videoUrl?: string
  /** 原始 payload（保留全部 SDK 字段）*/
  raw: unknown
  /** 接收时间 */
  receivedAt: number
}

// =============================================================================
// 会话路由
// =============================================================================

export interface SessionRouting {
  /** 钉钉 conversationId → DSH SessionId 的稳定映射 */
  sessionId: string
  /** 该会话应该使用的 agent scope（决定用哪个 preset）*/
  agentScope: string
  /** 'group' = 群内所有人共享一个 session；'group_sender' = 群内按发送者拆 session */
  sessionScope: 'group' | 'group_sender'
}

// =============================================================================
// AI Card
// =============================================================================

export interface AiCardInstance {
  /** 本插件分配的 card id（仅本地使用）*/
  cardKey: string
  /** 钉钉返回的 cardInstanceId（用于 update）*/
  cardInstanceId?: string
  /** 钉钉 conversationId（私聊/群）*/
  conversationId: string
  /** 创建时间，用于复用窗口判断 */
  createdAt: number
  /** 当前状态 */
  status: 'thinking' | 'streaming' | 'tool-calling' | 'done' | 'failed'
}

// =============================================================================
// Agent 消息（灌入 DSH inbox 的 payload）
// =============================================================================

export interface DingtalkAgentMessage {
  role: 'user'
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } }
    | { type: 'file'; source: { type: 'url'; url: string }; name: string }
    | { type: 'audio'; source: { type: 'url'; url: string } }
  >
  source: {
    kind: 'dingtalk'
    conversationId: string
    conversationType: '1' | '2'
    senderStaffId?: string
    senderNick?: string
    messageId: string
    receivedAt: number
  }
}

// =============================================================================
// Bridge 上下文（apply() 内捕获，stream 回调闭包使用）
// =============================================================================

export interface BridgeContext {
  ctx: import('cordis').Context
  config: DingtalkConfig
  credentials: ResolvedDingtalkCredentials
  /** 同一 conversationId → AgentHandle 的缓存（按 sessionScope 区分）*/
  handleCache: Map<string, import('@deepseek-ai/dsh-agent').AgentHandle>
  /** 同一 conversationId → 当前活跃 AI Card 实例的缓存 */
  cardCache: Map<string, AiCardInstance>
  /** 同一 cardKey → 真实 apis/ AICardInstance（带 token/expire/inputing 字段）*/
  cardRealCache?: Map<string, import('./apis/messaging.js').AICardInstance>
  /** 已配对的私聊用户（pairing 模式）*/
  pairedStaffIds: Set<string>
}