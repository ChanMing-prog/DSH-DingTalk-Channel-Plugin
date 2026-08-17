/**
 * Tools — 把钉钉能力封装成 DSH 可调用的 tool
 *
 * 命名约定：所有 tool 以 `dingtalk_` 为前缀，便于模型识别和工具分类。
 * 首版交付 7 个 tool 的占位定义；后续按需填充业务逻辑（fork 自上游
 * services/messaging、docs、calendar、task、sheet、log）。
 *
 * DSH ctx.tools.register 的 ToolDefinition 形态（参考 @deepseek-ai/dsh-tools）：
 *   {
 *     name: 'string',
 *     description: 'string',
 *     input: { schema: schemasteryShape, render: (...) => ModelContent[] },
 *     output: { schema: schemasteryShape, render: (...) => ModelContent[] },
 *     timeoutMs?: number,
 *     execute: (args, ctx) => Promise<result>,
 *     finalizeContent?: (...) => ModelContent[],
 *   }
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { createLogger } from '../utils/logger.js'
import { createSendTool } from './dingtalk_send.js'
import { createDocTool } from './dingtalk_doc.js'
import { createSheetTool } from './dingtalk_sheet.js'
import { createCalendarTool } from './dingtalk_calendar.js'
import { createTaskTool } from './dingtalk_task.js'
import { createLogTool } from './dingtalk_log.js'
import { createDingTool } from './dingtalk_ding.js'

const log = createLogger('dingtalk-tools')

export function registerTools(ctx: Context, config: DingtalkConfig): void {
  const tools = ctx['tools'] as
    | { register?: (def: unknown) => () => void }
    | undefined

  if (!tools?.register) {
    log.warn('ctx.tools.register not available; tools will not be exposed. Load @deepseek-ai/dsh-tools before this plugin.')
    return
  }

  const factories = [
    createSendTool,
    createDocTool,
    createSheetTool,
    createCalendarTool,
    createTaskTool,
    createLogTool,
    createDingTool,
  ]

  for (const factory of factories) {
    try {
      const def = factory(ctx, config)
      tools.register(def)
      log.debug(`registered tool: ${(def as { name: string }).name}`)
    } catch (err) {
      log.error(`failed to register tool from ${factory.name}`, err)
    }
  }
}