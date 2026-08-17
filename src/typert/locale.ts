/**
 * Locale entry (PR-6b) — backward-compat shim for PR-5 imports.
 *
 * PR-5 had a flat `LOCALE = { 'zh-CN': {...}, en: {...} }` constant.
 * PR-6b splits it into per-language files under `./locale/{zh,en,ja}.ts`
 * and centralizes assembly in `./locale/index.ts`.
 *
 * This file re-exports the new structure under the same name `LOCALE` so
 * `tests/typert.test.ts` (PR-5) keeps passing without modification. The
 * keys are remapped from 'zh-CN' → 'zh' to match DSH's actual locale id
 * format (dsh-client-locale uses ['zh', 'en'], not ['zh-CN', 'en-US']).
 */

import {
  LOCALES,
  LOCALES_FOR_REGISTER,
  lookupLocale,
  findLocaleDivergence,
  type LocaleCode,
  type LocaleEntry,
  type LocaleKey,
} from './locale/index.js'

export { LOCALES, LOCALES_FOR_REGISTER, lookupLocale, findLocaleDivergence }
export type { LocaleCode, LocaleEntry, LocaleKey }

/**
 * PR-5 backward-compat: 旧测试期待 `LOCALE['zh-CN']` 形态。
 * 我们做 alias：把 'zh-CN' 映射到 'zh'。
 */
export const LOCALE: Record<string, Record<string, string>> = {
  'zh-CN': LOCALES.zh.dict,
  en: LOCALES.en.dict,
  'zh': LOCALES.zh.dict,
  'ja': LOCALES.ja.dict,
}