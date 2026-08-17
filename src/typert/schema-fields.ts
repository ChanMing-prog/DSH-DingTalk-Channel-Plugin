/**
 * 顶层 schema 字段名常量 — PR-6c 用来检测 manifest drift.
 *
 * 必须与 settings-schema.ts 中 DingtalkConfigSchema 的 keys 同步。
 * 写在一个独立文件而不是 embed 在 settings-schema.ts 里，方便 lint 脚本
 * （scripts/lint-typert.ts）独立 import，避开 zod schema 转译复杂度。
 *
 * 维护规则：每添加新字段，必须同步更新以下列表 + sections.ts 的对应 section。
 */

export const TOP_LEVEL_SCHEMA_FIELDS = [
  'enabled',
  'defaultAccount',
  'clientId',
  'clientSecret',
  'enableMediaUpload',
  'systemPrompt',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'groupAllowFrom',
  'requireMention',
  'groups',
  'historyLimit',
  'textChunkLimit',
  'mediaMaxMb',
  'routes',
  'accounts',
  'bindings',
  'inboxWakeup',
  'streamTimeoutMs',
  'jobsControllerName',
  'aiCardReuseMs',
  'toolsOnly',
] as const

export type TopLevelSchemaField = (typeof TOP_LEVEL_SCHEMA_FIELDS)[number]