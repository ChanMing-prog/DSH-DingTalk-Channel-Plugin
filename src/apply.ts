/**
 * DSH DingTalk Channel Plugin — Main Entry
 *
 * 默认导出的 `apply(ctx)` 是 DSH cordis 插件的标准入口。
 * DSH 的 Loader 通过 `cordis.yml` 解析此模块时，会以 default export 的形式
 * 调用 apply 并把它安装到 host composition。
 *
 * 用法（在 host composition 的 cordis.yml 里）：
 *
 *   - id: dingtalk-channel
 *     name: '@local/dsh-channel-dingtalk'
 *     config:
 *       enabled: true
 *       dmPolicy: 'pairing'
 *       ...
 *
 * 职责：
 *   1. 注册 settings namespace（`channel-dingtalk`）
 *   2. 注册 credentials（只引用 env 变量）
 *   3. 注册 7 个 DSH tool（如果 toolsOnly !== true）
 *   4. 注册 jobs controller（dingtalk-stream）
 *   5. 启动 stream bridge（订阅 dingtalk-stream 事件 → 路由到 DSH agent）
 *   6. fiber dispose 时优雅关闭所有订阅
 */

import type { Context } from 'cordis'
import { DingtalkConfigSchema, type DingtalkConfig } from '../settings-schema.js'
import { createLogger } from './utils/logger.js'
import { resolveCredentials, registerCredentials, registerSettings } from './runtime/setup.js'
import { registerTools } from './tools/index.js'
import { startDingtalkStreamBridges } from './runtime/stream.js'
import { registerJobsController } from './runtime/jobs-controller.js'
import { checkConfigStatus, lintTypert } from './typert/index.js'
import { LOCALES_FOR_REGISTER } from './typert/locale/index.js'
import { registerConfigStatusService } from './typert/reflect.js'
import { TOP_LEVEL_SCHEMA_FIELDS } from './typert/schema-fields.js'

export const CHANNEL_ID = 'dingtalk-connector' as const
export const PLUGIN_NAME = '@local/dsh-channel-dingtalk'

const log = createLogger('dingtalk-channel')

export default function apply(ctx: Context, rawConfig: unknown = {}): void {
  // 0. 兜底校验 entry config
  const parse = DingtalkConfigSchema.safeParse(rawConfig)
  if (!parse.success) {
    log.error('invalid config', parse.error.flatten())
    throw new Error(`[${PLUGIN_NAME}] invalid config: ${parse.error.message}`)
  }
  const config: DingtalkConfig = parse.data

  if (!config.enabled) {
    log.warn('plugin disabled by config.enabled=false')
    return
  }

  log.info(`applying ${PLUGIN_NAME} v0.5.0`)

  // 1. settings namespace
  registerSettings(ctx)

  // 2. credentials 引用（可选 service）
  registerCredentials(ctx)

  // 2.5 PR-5: 把 locale 字典推到 ctx.locale（DSH locale plugin）
  //         schema 自动渲染表单，但 schema 的字段名要用 locale 文案展示
  registerAllLocales(ctx)

  // 2.6 PR-5: 把 config status 计算结果推给 settings UI 顶部 banner
  try {
    const status = checkConfigStatus(config)
    log.info('config status', { ok: status.ok, enabledCount: status.enabledCount, warnings: status.warnings })
  } catch (err) {
    log.warn('failed to compute config status', err)
  }

  // 2.7 PR-6c: 注册 ConfigStatusService 为 Typert Remote service
  //         让浏览器端可以通过 ctx.remote.configStatus.check(config) 调用
  //         替代"把整个 settings 文档传过去"的做法
  let disposeConfigStatus: (() => void) | null = null
  try {
    disposeConfigStatus = registerConfigStatusService(ctx)
    log.debug('registered ConfigStatusService as Typert Remote')
  } catch (err) {
    log.warn('failed to register ConfigStatusService', err)
  }

  // 2.8 PR-6c: 启动时跑 typert lint（manifest + schema + locale）
  //         failures 不阻断启动（设置 UI 仍可用），但记 log
  try {
    const lintResult = lintTypert(TOP_LEVEL_SCHEMA_FIELDS)
    if (!lintResult.ok) {
      log.warn('typert lint has issues', {
        manifestErrors: lintResult.manifest.errors.length,
        schemaUncovered: lintResult.schemaCover.uncovered.length,
        schemaOrphan: lintResult.schemaCover.orphan.length,
        localeCoverage: lintResult.localeDrift.coverageByLocale,
      })
    } else {
      log.debug('typert lint passed', {
        sections: lintResult.manifest.stats.sectionCount,
        locales: lintResult.manifest.stats.localeCount,
      })
    }
  } catch (err) {
    log.warn('failed to run typert lint', err)
  }

  // 3. tools：把钉钉能力封装成 DSH 可调用工具
  if (!config.toolsOnly) {
    registerTools(ctx, config)
    log.debug('registered 7 DSH tools for dingtalk')
  }

  // 4. jobs controller：stream 长连接作为 long-running producer 注册到 ctx.jobs
  registerJobsController(ctx, config.jobsControllerName)

  // 5. stream bridges（PR-4：每个 enabled account 一个独立实例）
  let stopBridge: (() => void) | null = null
  try {
    const creds = resolveCredentials(config)
    stopBridge = startDingtalkStreamBridges(ctx, config, creds)
    log.info('dingtalk stream bridges started', {
      accounts: Object.keys(config.accounts ?? {}).filter((id) => config.accounts?.[id]?.enabled !== false).length || 1,
      defaultAccount: config.defaultAccount,
    })
  } catch (err) {
    log.error('failed to start dingtalk stream bridges', err)
  }

  // 6. fiber 卸载时清理
  ctx.effect(() => () => {
    log.info('disposing dingtalk channel plugin')
    try {
      stopBridge?.()
    } catch (err) {
      log.error('error stopping stream bridge', err)
    }
    try {
      disposeConfigStatus?.()
    } catch (err) {
      log.error('error disposing ConfigStatusService', err)
    }
  })

  // 7. 暴露 channel 标识供其他插件查询
  ctx['channel-dingtalk'] = {
    id: CHANNEL_ID,
    name: PLUGIN_NAME,
    config,
    version: '0.5.0',
    /** PR-5: typert manifest 入口（dsh-typert-loader 已自动注册；这里冗余提供给 runtime 上下文查询）*/
    typertVersion: '0.5.0',
    localeKeys: Object.keys(LOCALE['zh-CN']),
  } as const
}

/**
 * PR-5 + PR-6b: 把 channel-dingtalk locale 字典（zh + en + ja）推到 ctx.locale.
 *
 * DSH contract（参考 dsh-client-locale/lib/client.js）：
 *   - locale IDs 是 ['zh', 'en'] 等 base subtag，不是 ['zh-CN', 'en-US']
 *   - `register(ns, dict)` 一行注册整个 dict（dict 形如 { zh: {...}, en: {...} }）
 *   - 重复注册会抛错：locale namespace "X" already has locale "Y"
 *   - 查找链：active locale → 'zh' fallback → common fallback → key 本身
 *
 * 本函数兼容 dsh-client-locale 与未来可能的 dsh-locale-intl：
 *   - 优先检测 `register(ns, dict)` 形态（新版）
 *   - 回退到 `register(ns, localeId, dict)` 形态（旧版）
 *   - 都没有则 log warn（ctx.locale 不在 host composition 时常见）
 */
function registerAllLocales(ctx: Context): void {
  const locale = ctx['locale'] as
    | {
        register?: ((ns: string, dict: Record<string, Record<string, string>>) => unknown) &
          ((ns: string, localeId: string, dict: Record<string, string>) => unknown)
      }
    | undefined

  if (!locale?.register) {
    log.debug('ctx.locale not available; channel-dingtalk locales will not be registered')
    return
  }

  const NS = 'channel-dingtalk'

  try {
    // 一次性注册全部 locale
    locale.register(NS, LOCALES_FOR_REGISTER)
    log.info(
      `registered channel-dingtalk locales: ${Object.keys(LOCALES_FOR_REGISTER).join(', ')}`,
    )
  } catch (err) {
    // 兼容老 API：register(ns, localeId, dict) —逐个注册
    log.warn(`bulk locale.register failed, falling back to per-locale: ${(err as Error).message}`)
    let registeredCount = 0
    for (const [code, dict] of Object.entries(LOCALES_FOR_REGISTER)) {
      try {
        locale.register(NS, code, dict)
        registeredCount++
      } catch (innerErr) {
        log.warn(`failed to register locale ${code}: ${(innerErr as Error).message}`)
      }
    }
    log.info(`registered ${registeredCount} locales (fallback path)`)
  }
}