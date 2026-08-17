/**
 * Tool: dingtalk_task（占位）
 * 后续 PR：从上游 connector 的 task* 系列 fork 过来。
 */
import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'

export function createTaskTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_task',
    description: '钉钉待办任务（占位，后续 PR 填充）。',
    input: { schema: { type: 'object', properties: {} }, render() { return [] } },
    output: { schema: { type: 'object' }, render() { return [] } },
    timeoutMs: 30_000,
    async execute() {
      return { ok: false, error: 'dingtalk_task not implemented yet' }
    },
  }
}