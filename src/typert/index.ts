/**
 * Typert manifest 入口 — 被 dsh-typert-loader 自动 import.
 *
 * Loader 在 Loader 启动时扫描每个 entry package 的 `./typert` export,
 * 验证 TYPERT 常量，注册到 ctx.typert.registry。
 *
 * 同时被 src/apply.ts 主动 import 用于：
 *   - locale 字典推到 ctx.locale（DSH locale plugin）
 *   - sections 元数据被 settings UI 引用
 *   - PR-6c: lintTypert() 自检启动
 *   - PR-6c: registerConfigStatusService() 暴露 Remote endpoint
 */

export { TYPERT } from './manifest.js'
export { SECTIONS, getSection, findSectionForField, validateSectionCoverage, validateSectionFieldsExist, type SectionDef } from './sections.js'
export { LOCALE, type LocaleKey } from './locale.js'
export { checkConfigStatus, type ConfigStatus } from './validate.js'
export {
  validateTYPERTManifest,
  detectSchemaCoverDrift,
  detectLocaleDrift,
  lintTypert,
  type ManifestValidationError,
  type ManifestValidationResult,
  type LocaleDriftReport,
  type TypertLintResult,
} from './loader-contract.js'
export {
  ConfigStatusService,
  registerConfigStatusService,
  TYPERT_HOST_ARTIFACT,
  CONFIG_STATUS_SERVICE_KEY,
  CONFIG_STATUS_NAMESPACE,
} from './reflect.js'

import { TYPERT } from './manifest.js'
export default TYPERT