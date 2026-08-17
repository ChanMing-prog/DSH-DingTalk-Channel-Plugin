/**
 * Tool: dingtalk_log（占位）
 * 后续 PR：从上游 connector 的 log.ts fork 过来。
 */
import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'

export function createLogTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_log',
    description: '钉钉日志/日报/周报（占位，后续 PR 填充）。',
    input: { schema: { type: 'object', properties: {} }, render() { return [] } },
    output: { schema: { type: 'object' }, render() { return [] } },
    timeoutMs: 30_000,
    async execute() {
      return { ok: false, error: 'dingtalk_log not implemented yet' }
    },
  }
}