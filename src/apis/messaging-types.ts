/**
 * Shared types for messaging + media APIs.
 *
 * 直接 fork 自上游 connector 的 types + messaging 类型定义。
 * 适配 DSH：去掉对 OpenClaw DingtalkConfig 的依赖，改用本仓库的
 * `ResolvedDingtalkCredentials` 形态。
 */

import type { ResolvedDingtalkCredentials } from '../types.js'

// =============================================================================
// 钉钉 API 端点常量
// =============================================================================

export const DINGTALK_API = 'https://api.dingtalk.com'
export const DINGTALK_OAPI = 'https://oapi.dingtalk.com'

// =============================================================================
// 消息类型枚举
// =============================================================================

export type DingTalkMsgType =
  | 'text'
  | 'markdown'
  | 'link'
  | 'actionCard'
  | 'image'

/** 媒体消息类型（不走 AI Card，必须走普通消息 API）*/
export const MEDIA_MSG_TYPES = new Set<DingTalkMsgType>(['image'])

// =============================================================================
// 通用结果
// =============================================================================

export interface SendResult {
  ok: boolean
  processQueryKey?: string
  cardInstanceId?: string
  error?: string
  usedAICard?: boolean
}

// =============================================================================
// AI Card
// =============================================================================

export interface AICardTarget {
  type: 'user'
  userId: string
} | {
  type: 'group'
  openConversationId: string
}

export interface AICardInstance {
  cardInstanceId: string
  accessToken: string
  tokenExpireTime: number
  inputingStarted: boolean
}

export interface AICardStatus {
  PROCESSING: '1'
  INPUTING: '2'
  FINISHED: '3'
  EXECUTING: '4'
  FAILED: '5'
}

export const AI_CARD_STATUS: AICardStatus = {
  PROCESSING: '1',
  INPUTING: '2',
  FINISHED: '3',
  EXECUTING: '4',
  FAILED: '5',
}

/** AI Card 模板 ID（钉钉官方 stream 模板）*/
export const AI_CARD_TEMPLATE_ID = '02fcf2f4-5e02-4a85-b672-46d1f715543e.schema'

// =============================================================================
// 主动发送选项
// =============================================================================

export interface ProactiveSendOptions {
  msgType?: DingTalkMsgType
  replyToId?: string
  title?: string
  log?: ReturnType<typeof import('../utils/logger.js').createLogger>
  useAICard?: boolean
  fallbackToNormal?: boolean
  atDingtalkIds?: string[]
  atUserIds?: string[]
  atAll?: boolean
}

// =============================================================================
// 上传结果
// =============================================================================

export interface UploadResult {
  mediaId: string
  cleanMediaId: string
  downloadUrl: string
}

// =============================================================================
// 媒体类型
// =============================================================================

export type MediaType = 'image' | 'file' | 'video' | 'voice'

// =============================================================================
// Targets（用于主动发送）
// =============================================================================

export type SendTarget =
  | { type: 'user'; userId: string }
  | { type: 'group'; openConversationId: string }

// =============================================================================
// 客户端适配器（本仓库 messaging 函数的统一入参）
// =============================================================================

/**
 * 上游 connector 把所有函数都设计成 `(config: DingtalkConfig, ...)` 形态。
 * 本仓库为减少耦合，改为 `(creds: ResolvedDingtalkCredentials, ...)`，
 * 配置（policy、routes 等）走单独的 options 参数。
 */
export interface MessagingCallOptions {
  /** 调用方日志（debug/warn/error）*/
  log?: ReturnType<typeof import('../utils/logger.js').createLogger>
  /** 媒体最大字节数（image 默认 10MB / voice 2MB / video/file 20MB）*/
  maxMediaBytes?: number
  /** 主动发送时是否优先用 AI Card（默认 true）*/
  useAICard?: boolean
  /** AI Card 失败时是否回退到普通消息（默认 true）*/
  fallbackToNormal?: boolean
  /** 异步上下文（保留位：本仓库首版不用，预留给将来支持 cancellation）*/
  signal?: AbortSignal
}

// re-export 让外部代码一处导入
export type { ResolvedDingtalkCredentials }