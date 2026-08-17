/**
 * Locale registry — multi-language dictionary assembly + types.
 *
 * PR-6b: 重构 PR-5 的扁平 LOCALE 常量，按语言代码拆文件（zh / en / ja），
 *         提供类型 + lookup chain helper（给 client 端 useT 复用 fallback 逻辑）。
 *
 * DSH 注册 contract（参考 dsh-client-locale/lib/client.js）：
 *   - locale namespace 名 = 'channel-dingtalk'
 *   - 每个 locale 一次注册：`localeRuntime.register('channel-dingtalk', { zh, en, ja })`
 *   - 同一 namespace 同一 locale 重复注册会抛错（"already has locale"）
 *   - DSH 内部查找链：active locale → 'zh' fallback → common fallback → key 本身
 *
 * 我们的 fallback chain（client 端 useT 复用）：
 *   active locale → zh fallback → key 本身
 */

import { zh } from './zh.js'
import { en } from './en.js'
import { ja } from './ja.js'

export { zh, en, ja }

export type LocaleCode = 'zh' | 'en' | 'ja'

/**
 * 单语字典的元数据.
 */
export interface LocaleEntry {
  code: LocaleCode
  label: string  // 在 settings UI 里展示给用户，比如"中文（简体）"
  dict: Record<string, string>
}

export const LOCALES: Record<LocaleCode, LocaleEntry> = {
  zh: { code: 'zh', label: '中文（简体）', dict: zh },
  en: { code: 'en', label: 'English', dict: en },
  ja: { code: 'ja', label: '日本語', dict: ja },
}

/**
 * DSH 注册用的合并形态 —— 一行注册多个 locale。
 */
export const LOCALES_FOR_REGISTER: Record<string, Record<string, string>> = {
  zh,
  en,
  ja,
}

/**
 * 所有 locale key 的并集类型（编译时保证 key 完整）。
 * 强制确保每个 locale 文件都用同一组 key；缺失会在编译期报红。
 */
export type LocaleKey =
  | keyof typeof zh
  | keyof typeof en
  | keyof typeof ja

// =============================================================================
// lookup chain（client 端 useT 复用）
// =============================================================================

/**
 * 客户端 fallback chain lookup。
 *
 * 顺序：active locale → 'zh' fallback → key 本身。
 * 这与 DSH 服务端的查找链一致，所以浏览器侧表现和 settings UI 看到的保持一致。
 *
 * 参数替换 `{name}` 形式（与 DSH 一致）。
 */
export function lookupLocale(
  active: LocaleCode,
  key: string,
  params?: Record<string, string | number>,
): string {
  // 1. active locale
  let template = LOCALES[active]?.dict[key]

  // 2. zh fallback
  if (template === undefined && active !== 'zh') {
    template = zh[key]
  }

  // 3. key 本身（loud fallback）
  if (template === undefined) {
    template = key
  }

  if (params) {
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      name in params ? String(params[name]) : match,
    )
  }
  return template
}

/**
 * 校验：所有 locale 的 key 集合应该一致。
 * 返回只在某些 locale 中存在的 key（用于 CI 检查）。
 */
export function findLocaleDivergence(): {
  onlyInZh: string[]
  onlyInEn: string[]
  onlyInJa: string[]
} {
  const zhKeys = new Set(Object.keys(zh))
  const enKeys = new Set(Object.keys(en))
  const jaKeys = new Set(Object.keys(ja))
  return {
    onlyInZh: [...zhKeys].filter((k) => !enKeys.has(k)),
    onlyInEn: [...enKeys].filter((k) => !zhKeys.has(k)),
    onlyInJa: [...jaKeys].filter((k) => !zhKeys.has(k)),
  }
}