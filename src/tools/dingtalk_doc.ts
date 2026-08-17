/**
 * Tool: dingtalk_doc
 *
 * 让 DSH agent 操作钉钉文档（创建、追加、搜索、列举）。
 * 首版只提供 search + create 最小可用。
 *
 * 完整协议见上游 docs.ts / src/apis/docs.ts 后续填充。
 */

import type { Context } from 'cordis'
import type { DingtalkConfig } from '../../settings-schema.js'

export function createDocTool(_ctx: Context, _config: DingtalkConfig) {
  return {
    name: 'dingtalk_doc',
    description: '钉钉文档操作（创建/搜索/追加）。首版只实现 search；create 后续 PR。',
    input: {
      schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['search', 'create'], default: 'search' },
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
        required: ['action'],
      },
      render() {
        return []
      },
    },
    output: {
      schema: { type: 'object' },
      render() {
        return []
      },
    },
    timeoutMs: 30_000,
    async execute(args: { action: 'search' | 'create'; query?: string; limit?: number }) {
      return {
        ok: false,
        error: `[dingtalk_doc.${args.action}] not implemented yet — fork from upstream services in next PR`,
      }
    },
  }
}