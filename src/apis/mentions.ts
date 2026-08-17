/**
 * Bot @-mention resolver — STUB.
 *
 * 上游 connector 的 mentions.ts 是多机器人协作支持（让 AI 写
 * "@dev-agent / @开发助手机器人"时自动替换成 chatbotUserId 加密 ID）。
 *
 * 本仓库首版只支持单机器人，留 stub 占位。
 *
 * 后续 PR-4（多机器人协作）会从这里扩展：
 *   - accounts.<id>.chatbotUserId 配置
 *   - bindings[].match.accountId → agentId 反查
 *   - 多账号别名表（accountId / name / agentId）合并
 */

import type { ResolvedDingtalkCredentials } from '../types.js'

export interface BotMentionEntry {
  accountId: string
  chatbotUserId?: string
  name?: string
  agentIds: string[]
  aliases: string[]
}

export interface BuildMentionTableOptions {
  extraAliases?: Record<string, string>
  detectBareAliases?: boolean
}

export interface MentionSubstitutionResult {
  text: string
  injectedChatbotUserIds: string[]
}

export function buildBotMentionTable(
  _creds: ResolvedDingtalkCredentials | unknown,
  _options: BuildMentionTableOptions = {},
): BotMentionEntry[] {
  // 单机器人模式：返回空表
  return []
}

export function substituteBotMentions(
  text: string,
  _creds: ResolvedDingtalkCredentials | unknown,
  _options: BuildMentionTableOptions = {},
): MentionSubstitutionResult {
  return { text, injectedChatbotUserIds: [] }
}