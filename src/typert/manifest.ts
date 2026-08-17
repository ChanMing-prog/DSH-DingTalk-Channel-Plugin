/**
 * Typert Manifest — 插件在 DSH Typert registry 中的身份 + 贡献声明.
 *
 * 由 @deepseek-ai/dsh-typert-loader 自动发现（扫描每个 Loader entry 的 ./typert export）。
 *
 * 本 manifest 告诉 DSH：
 *   - 插件身份：package / face
 *   - 暴露的贡献（contributions）
 *     - `settings.plugins.tab`：在"设置 → 插件"标签页里添加一个 tab
 *     - `settings.plugin.item`：在"插件配置"标签页里添加一个 card
 *
 * 注意：本仓库首版不含完整 typert-generator 流水线（不引入 zod schema 生成）。
 * manifest 是手写元数据。后续 PR-6+ 可以接 typert-generator 做自动反射。
 */

import { SECTIONS } from './sections.js'
import { LOCALE } from './locale.js'

export const TYPERT = {
  package: '@local/dsh-channel-dingtalk',
  face: 'host',

  // 暴露给 DSH settings UI 的"贡献"。DSH 的 settings.plugins.tab / settings.plugin.item
  // 是已注册的 slot，我们在 manifest 里声明要贡献到哪些 slot、用什么 id/order/label。
  contributions: {
    /** 在"设置 → 插件"标签页里新增一个名为 "DingTalk Channel" 的子 tab */
    'settings.plugins.tab': {
      id: 'channel-dingtalk',
      order: 35,
      label: {
        'zh-CN': '钉钉 Channel',
        en: 'DingTalk Channel',
      },
    },

    /** 在"插件配置"标签页里贡献一张配置卡片。
     *  dsh-client-ui-settings-plugins 会自动根据本仓库注册的 schemastery schema
     *  生成表单，本插件只需要声明"有这个 card"。*/
    'settings.plugin.item': {
      id: 'channel-dingtalk.card',
      order: 35,
      label: {
        'zh-CN': '钉钉 Channel',
        en: 'DingTalk Channel',
      },
      description: {
        'zh-CN': '把钉钉消息桥接到 DSH agent，支持多账号、AI Card 流式、@ 机器人路由。',
        en: 'Bridge DingTalk messages to DSH agents. Multi-account, AI Card streaming, bot @-mention routing.',
      },
      /** 指向具体 section —— settings UI 会按 sections 的顺序渲染分块表单 */
      sections: SECTIONS,
    },
  },

  /** i18n 字典（zh-CN / en）。DSH locale 插件会合并到 ctx.locale。 */
  locale: LOCALE,

  /** 暴露本插件的所有 schemastery 字段标签（settings UI 自动渲染时用到）*/
  schemaHints: {
    /** 顶层 settings 命名空间名 */
    namespace: 'channel-dingtalk',
    /** 标记 fields that are credentials（输入框不展示明文）*/
    secretFields: ['clientSecret'],
    /** 标记多账号字段（会渲染成账号列表 + 折叠面板）*/
    multiAccountFields: ['accounts'],
    /** 标记 bindings 字段（会渲染成绑定关系列表）*/
    bindingsField: 'bindings',
  },

  /** 暴露给 browser half 的 metadata */
  meta: {
    version: '0.5.0',
    pluginName: '@local/dsh-channel-dingtalk',
    capabilities: [
      'multi-account',
      'multi-bot-bindings',
      'ai-card-streaming',
      'video-audio-file-upload',
      'mention-resolution',
    ],
  },
} as const

export default TYPERT