/**
 * Tools — 把钉钉能力封装成 DSH 可调用的 tool
 *
 * 目前 3 个工具：
 *   - dingtalk_send:       向钉钉会话发送文本/Markdown/图片消息（AI Card 优先）
 *   - dingtalk_send_media: 向钉钉会话发送本地媒体文件（图片/视频/音频/文件）
 *   - dingtalk_process_markers: 发送含 [DINGTALK_VIDEO|AUDIO|FILE] 标记的文本
 *
 * 命名约定：所有 tool 以 `dingtalk_` 为前缀，便于模型识别和工具分类。
 *
 * DSH ctx.tools.register 的 ToolDefinition 形态（参考 @deepseek-ai/dsh-tools）：
 *   {
 *     name: 'string',
 *     description: 'string',
 *     input: { schema: schemasteryShape, render: (...) => ModelContent[] },
 *     output: { schema: schemasteryShape, render: (...) => ModelContent[] },
 *     timeoutMs?: number,
 *     execute: (args, ctx) => Promise<result>,
 *   }
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'
import { createLogger } from '../utils/logger.js'
import { createSendTool } from './dingtalk_send.js'
import { createSendMediaTool } from './dingtalk_send_media.js'
import { createProcessMarkersTool } from './dingtalk_process_markers.js'

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
    createSendMediaTool,
    createProcessMarkersTool,
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