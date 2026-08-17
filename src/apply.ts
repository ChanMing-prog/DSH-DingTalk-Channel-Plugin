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
import { startDingtalkStreamBridge } from './runtime/stream.js'
import { registerJobsController } from './runtime/jobs-controller.js'

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

  log.info(`applying ${PLUGIN_NAME} v0.1.0`)

  // 1. settings namespace
  registerSettings(ctx)

  // 2. credentials 引用（可选 service）
  registerCredentials(ctx)

  // 3. tools：把钉钉能力封装成 DSH 可调用工具
  if (!config.toolsOnly) {
    registerTools(ctx, config)
    log.debug('registered 7 DSH tools for dingtalk')
  }

  // 4. jobs controller：stream 长连接作为 long-running producer 注册到 ctx.jobs
  registerJobsController(ctx, config.jobsControllerName)

  // 5. stream bridge：启动订阅
  let stopBridge: (() => void) | null = null
  try {
    const creds = resolveCredentials(config)
    stopBridge = startDingtalkStreamBridge(ctx, config, creds)
    log.info('dingtalk stream bridge started', {
      accountId: config.defaultAccount,
    })
  } catch (err) {
    log.error('failed to start dingtalk stream bridge', err)
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
    version: '0.1.0',
  } as const
}