/**
 * Jobs Controller Registration
 *
 * 把钉钉 stream 长连接注册成 ctx.jobs 上的一个 controller。
 *
 * DSH ctx.jobs 的接口（参考 @deepseek-ai/dsh-jobs）：
 *   - start(spec): JobId
 *   - attachController(name)
 *   - get/list/read/kill/wait
 *   - onJobDone / onJobsChanged
 *
 * stream 连接作为 long-running producer 注册到这里后，DSH 进程级 watchdog
 * 会监管它：session 退出时统一 cancel，断线恢复时统一 retry，UI 可以列出
 * 它（`dsh jobs list`）。
 */

import type { Context } from 'cordis'
import { createLogger } from '../utils/logger.js'
import type { DingtalkConfig } from '../../settings-schema.js'

const log = createLogger('dingtalk-jobs')

export interface DingtalkJobSpec {
  kind: 'dingtalk-stream'
  clientId: string
  /** 提供 run() 实际启动 stream；本 controller 仅声明归属 */
  start: () => Promise<void>
}

export function registerJobsController(ctx: Context, controllerName: string): void {
  const jobs = ctx['jobs'] as
    | {
        attachController?: (name: string) => () => void
      }
    | undefined

  if (!jobs?.attachController) {
    log.warn('ctx.jobs.attachController not available; stream will run unmanaged. Load @deepseek-ai/dsh-jobs-local before this plugin for proper lifecycle.')
    return
  }

  const dispose = jobs.attachController(controllerName)
  log.debug(`attached jobs controller: ${controllerName}`)

  // 卸载时 dispose
  ctx.effect(() => () => {
    try {
      dispose()
    } catch (err) {
      log.error('error disposing jobs controller', err)
    }
  })
}

/**
 * 上游 connector 把 stream provider 注册成 ctx.jobs 的 'dingtalk-stream-N'
 * job 实例时使用的 spec 形态。后续 jobs.start(spec) 用它。
 */
export function buildStreamJobSpec(
  config: DingtalkConfig,
  clientId: string,
  runFn: () => Promise<void>,
): DingtalkJobSpec {
  return {
    kind: 'dingtalk-stream',
    clientId,
    start: runFn,
  }
}