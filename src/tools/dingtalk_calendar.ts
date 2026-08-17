/**
 * Tool: dingtalk_calendar（占位）
 * 后续 PR：从上游 connector 的 calendar* 系列 fork 过来。
 */
import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'

export function createCalendarTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_calendar',
    description: '钉钉日历日程（占位，后续 PR 填充）。',
    input: { schema: { type: 'object', properties: {} }, render() { return [] } },
    output: { schema: { type: 'object' }, render() { return [] } },
    timeoutMs: 30_000,
    async execute() {
      return { ok: false, error: 'dingtalk_calendar not implemented yet' }
    },
  }
}