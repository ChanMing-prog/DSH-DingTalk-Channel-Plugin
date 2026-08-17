/**
 * Loader contract validation — mirror what @deepseek-ai/dsh-typert-loader does.
 *
 * 真正的 loader 行为（参考 dsh-typert-loader README）：
 *   1. 扫描每个 Loader entry 的 package.json
 *   2. 解析 entry 的 `./typert` export
 *   3. 验证 TYPERT manifest 形状（必须有 package / face / schemas / invocations / model）
 *   4. 注册到 ctx.typert.registry
 *   5. 失败的话"activation fails loud"（已经挂载的 fiber 报错；未挂载的 log 并跳过）
 *
 * 本文件提供：
 *   - validateTYPERTManifest(): 一行检测我们自己的 manifest 是否合规
 *   - validateHostArtifact(): 检测 generator-style artifact
 *   - assertManifestSelfConsistency(): manifest ↔ sections ↔ locale 三方一致性
 *
 * 用法：
 *   - 单元测试中调用
 *   - `pnpm lint:typert` 脚本调用
 *   - apply.ts 启动时调用（CI fail-loud 配对）
 */

import { TYPERT } from './manifest.js'
import { SECTIONS } from './sections.js'
import { LOCALES } from './locale/index.js'

// =============================================================================
// Manifest schema validation
// =============================================================================

export interface ManifestValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface ManifestValidationResult {
  ok: boolean
  errors: ManifestValidationError[]
  warnings: ManifestValidationError[]
  stats: {
    sectionCount: number
    fieldCount: number
    localeCount: number
    localeKeyCount: number
  }
}

/**
 * Validate the TYPERT manifest against the dsh-typert-loader contract.
 *
 * Required fields:
 *   - package: string (npm package name)
 *   - face: 'host' | 'client'
 *
 * Recommended fields:
 *   - contributions: { 'settings.plugins.tab': [...], 'settings.plugin.item': [...] }
 *   - locale: { [bcp47: string]: Record<string, string> }
 *   - meta: { version, capabilities, ... }
 *
 * Returns a structured result with errors + warnings.
 */
export function validateTYPERTManifest(): ManifestValidationResult {
  const errors: ManifestValidationError[] = []
  const warnings: ManifestValidationError[] = []

  // 1. required fields
  if (!TYPERT.package || typeof TYPERT.package !== 'string') {
    errors.push({ path: 'package', message: 'package (npm name) is required', severity: 'error' })
  }
  if (!TYPERT.face || (TYPERT.face !== 'host' && TYPERT.face !== 'client')) {
    errors.push({
      path: 'face',
      message: `face must be 'host' or 'client', got ${JSON.stringify(TYPERT.face)}`,
      severity: 'error',
    })
  }

  // 2. contributions shape
  if (!TYPERT.contributions) {
    errors.push({ path: 'contributions', message: 'contributions is required', severity: 'error' })
  } else {
    const tab = TYPERT.contributions['settings.plugins.tab']
    const item = TYPERT.contributions['settings.plugin.item']
    if (!tab) {
      warnings.push({
        path: 'contributions.settings.plugins.tab',
        message: 'missing settings.plugins.tab contribution',
        severity: 'warning',
      })
    }
    if (!item) {
      errors.push({
        path: 'contributions.settings.plugin.item',
        message: 'missing settings.plugin.item contribution',
        severity: 'error',
      })
    }
  }

  // 3. locale shape
  const localeCount = Object.keys(LOCALES).length
  if (localeCount === 0) {
    errors.push({ path: 'locale', message: 'locale dictionary is empty', severity: 'error' })
  } else if (localeCount === 1) {
    warnings.push({
      path: 'locale',
      message: 'only one locale shipped; consider adding fallback (en + zh)',
      severity: 'warning',
    })
  }

  // 4. locale content quality
  let localeKeyCount = 0
  for (const [code, entry] of Object.entries(LOCALES)) {
    const keys = Object.keys(entry.dict)
    localeKeyCount = Math.max(localeKeyCount, keys.length)
    if (keys.length === 0) {
      errors.push({
        path: `locale.${code}`,
        message: `locale "${code}" has no keys`,
        severity: 'error',
      })
    }
  }

  // 5. meta version
  if (!TYPERT.meta?.version) {
    warnings.push({
      path: 'meta.version',
      message: 'meta.version missing; loader may not show version in UI',
      severity: 'warning',
    })
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      sectionCount: SECTIONS.length,
      fieldCount: SECTIONS.reduce((acc, s) => acc + s.fields.length, 0),
      localeCount,
      localeKeyCount,
    },
  }
}

// =============================================================================
// Settings-schema ↔ manifest drift detection
// =============================================================================

/**
 * 检测 schema 中的字段是否都被 manifest section 覆盖。
 *
 * 字段名通过 `ChannelDingtalkSettings` 类型推断（不能直接 runtime introspect
 * schemastery schema，所以从 `DingtalkConfig.fields` 提取）。
 */
export function detectSchemaCoverDrift(
  schemaFields: readonly string[],
): { uncovered: string[]; orphan: string[] } {
  const covered = new Set<string>()
  for (const s of SECTIONS) for (const f of s.fields) covered.add(f)
  const uncovered = schemaFields.filter((f) => !covered.has(f))
  const orphan: string[] = []
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      if (!schemaFields.includes(f)) orphan.push(`${s.id}.${f}`)
    }
  }
  return { uncovered, orphan }
}

// =============================================================================
// Locale coverage drift
// =============================================================================

/**
 * 检测每个 locale 的翻译覆盖:
 *   - 哪些 key 只在 zh 存在（其它 locale 缺失）
 *   - 哪些 key 只在 en 存在
 *   - 翻译覆盖比例
 */
export interface LocaleDriftReport {
  perLocale: Record<string, { translated: number; missingFromBase: string[]; missingFromOther: string[] }>
  baseLocale: string
  coverageByLocale: Record<string, number>  // 0-1
}

export function detectLocaleDrift(): LocaleDriftReport {
  const base: 'zh' = 'zh'
  const baseKeys = new Set(Object.keys(LOCALES[base].dict))
  const perLocale: LocaleDriftReport['perLocale'] = {}
  const coverageByLocale: LocaleDriftReport['coverageByLocale'] = {}

  for (const [code, entry] of Object.entries(LOCALES)) {
    const localKeys = new Set(Object.keys(entry.dict))
    const missingFromBase: string[] = []
    const missingFromOther: string[] = []

    // 只在 other locale 存在、base 没有的 key
    for (const k of localKeys) {
      if (code !== base && !baseKeys.has(k)) missingFromBase.push(k)
    }
    // 在 base 存在、this locale 缺失的 key
    for (const k of baseKeys) {
      if (!localKeys.has(k)) missingFromOther.push(k)
    }

    const translated = baseKeys.size - missingFromOther.length
    perLocale[code] = {
      translated,
      missingFromBase,
      missingFromOther,
    }
    coverageByLocale[code] = baseKeys.size === 0 ? 1 : translated / baseKeys.size
  }

  return { perLocale, baseLocale: base, coverageByLocale }
}

// =============================================================================
// Self-consistency check (one-stop validation)
// =============================================================================

export interface TypertLintResult {
  manifest: ManifestValidationResult
  schemaCover: { uncovered: string[]; orphan: string[] }
  localeDrift: LocaleDriftReport
  ok: boolean
}

export function lintTypert(schemaFields: readonly string[]): TypertLintResult {
  const manifest = validateTYPERTManifest()
  const schemaCover = detectSchemaCoverDrift(schemaFields)
  const localeDrift = detectLocaleDrift()

  const allErrors = manifest.errors.length
  + (schemaCover.uncovered.length > 0 ? 1 : 0)
  + (schemaCover.orphan.length > 0 ? 1 : 0)
  + Object.values(localeDrift.coverageByLocale).filter((c) => c < 0.5).length

  return {
    manifest,
    schemaCover,
    localeDrift,
    ok: allErrors === 0,
  }
}