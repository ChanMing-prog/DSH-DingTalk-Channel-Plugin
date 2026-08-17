/**
 * Sections — settings UI 字段分组.
 *
 * 把 schemastery schema 的 20+ 字段拆成 6 个逻辑分组，让用户分块阅读：
 *   1. credentials  凭证（顶层 / 兜底账号）
 *   2. basic         基本（启用 / 默认账号 / systemPrompt / 媒体上传）
 *   3. dmPolicy      私聊策略
 *   4. groupPolicy   群聊策略（含 groups）
 *   5. accounts      多账号 / 多机器人（核心：可视化编辑）
 *   6. bindings      Agent 绑定
 *   7. bridge        Bridge 行为
 *   8. limits        消息限制
 *   9. routes        会话路由（顶层，向后兼容）
 *
 * 每个 section 都声明 `fields`（按 schema 字段名引用）+ `order`（UI 顺序）。
 */

export interface SectionDef {
  id: string
  titleKey: string  // locale key, e.g. 'channel-dingtalk.accounts.title'
  descriptionKey?: string
  order: number
  fields: string[]
  /** 是否折叠（默认展开）*/
  collapsedByDefault?: boolean
  /** 标记需要特殊 widget（默认 schemastery 自动渲染）*/
  customWidget?: 'accounts-list' | 'bindings-list' | 'groups-dict' | null
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'credentials',
    titleKey: 'channel-dingtalk.credentials.title',
    descriptionKey: 'channel-dingtalk.credentials.description',
    order: 10,
    fields: ['clientId', 'clientSecret'],
  },
  {
    id: 'basic',
    titleKey: 'channel-dingtalk.title',
    order: 20,
    fields: ['enabled', 'defaultAccount', 'systemPrompt', 'enableMediaUpload'],
  },
  {
    id: 'dmPolicy',
    titleKey: 'channel-dingtalk.dmPolicy.title',
    order: 30,
    fields: ['dmPolicy', 'allowFrom'],
  },
  {
    id: 'groupPolicy',
    titleKey: 'channel-dingtalk.groupPolicy.title',
    order: 40,
    fields: ['groupPolicy', 'groupAllowFrom', 'requireMention', 'groups'],
    customWidget: 'groups-dict',
  },
  {
    id: 'accounts',
    titleKey: 'channel-dingtalk.accounts.title',
    descriptionKey: 'channel-dingtalk.accounts.description',
    order: 50,
    fields: ['accounts'],
    customWidget: 'accounts-list',
    collapsedByDefault: false, // PR-4 的核心价值，强制展开
  },
  {
    id: 'bindings',
    titleKey: 'channel-dingtalk.bindings.title',
    descriptionKey: 'channel-dingtalk.bindings.description',
    order: 60,
    fields: ['bindings'],
    customWidget: 'bindings-list',
  },
  {
    id: 'routes',
    titleKey: 'channel-dingtalk.routes.title',
    descriptionKey: 'channel-dingtalk.routes.description',
    order: 70,
    fields: ['routes'],
  },
  {
    id: 'bridge',
    titleKey: 'channel-dingtalk.bridge.title',
    descriptionKey: 'channel-dingtalk.bridge.description',
    order: 80,
    fields: ['inboxWakeup', 'streamTimeoutMs', 'jobsControllerName', 'aiCardReuseMs', 'toolsOnly'],
  },
  {
    id: 'limits',
    titleKey: 'channel-dingtalk.limits.title',
    order: 90,
    fields: ['historyLimit', 'textChunkLimit', 'mediaMaxMb'],
    collapsedByDefault: true,
  },
]

/**
 * 按 id 查 section.
 */
export function getSection(id: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.id === id)
}

/**
 * 按 schema 字段名反查其归属 section.
 */
export function findSectionForField(fieldName: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.fields.includes(fieldName))
}

/**
 * 校验：所有 schema 字段都被 sections 覆盖. 返回缺失字段名列表.
 *
 * 用于运行时一致性检查 + typert 测试.
 */
export function validateSectionCoverage(allFields: readonly string[]): string[] {
  const covered = new Set<string>()
  for (const s of SECTIONS) for (const f of s.fields) covered.add(f)
  return allFields.filter((f) => !covered.has(f))
}

/**
 * 校验：所有声明的字段都在 schema 里存在. 返回悬空字段名列表.
 */
export function validateSectionFieldsExist(allFields: readonly string[]): string[] {
  const set = new Set(allFields)
  const orphans: string[] = []
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      if (!set.has(f)) orphans.push(`${s.id}.${f}`)
    }
  }
  return orphans
}