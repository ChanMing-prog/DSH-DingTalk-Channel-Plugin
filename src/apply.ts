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
import { LOCALE, checkConfigStatus } from './typert/index.js'

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
  registerLocale(ctx)

  // 2.6 PR-5: 把 config status 计算结果推给 settings UI 顶部 banner
  try {
    const status = checkConfigStatus(config)
    log.info('config status', { ok: status.ok, enabledCount: status.enabledCount, warnings: status.warnings })
  } catch (err) {
    log.warn('failed to compute config status', err)
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
 * PR-5: 把 channel-dingtalk locale 字典推到 ctx.locale.
 * DSH locale plugin 会合并到全局 locale store.
 */
function registerLocale(ctx: Context): void {
  const locale = ctx['locale'] as
    | {
        register?: (namespace: string, dict: Record<string, string>) => unknown
      }
    | undefined

  if (!locale?.register) {
    log.debug('ctx.locale not available; channel-dingtalk locale will not be registered')
    return
  }

  try {
    locale.register('channel-dingtalk', LOCALE['zh-CN'])
    // en 字典需要按 DSH locale 的多语言机制注册；这里先注册 zh-CN
    // 完整多语言：PR-6 接入 dsh-locale-intl
    log.debug('registered channel-dingtalk locale (zh-CN)')
  } catch (err) {
    log.warn('failed to register locale', err)
  }
}