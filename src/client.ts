/**
 * Client (browser) entry — DSH 双面插件的浏览器侧.
 *
 * PR-5: 把 DSH settings UI 需要的所有 metadata 集中导出.
 *
 * dsh-client-modules 系统会通过 package.json exports["client"] 自动发现
 * 这个入口并加载。它注册：
 *   - settings.cards 贡献（每个账号独立编辑 panel）
 *   - locale 字典（同 src/typert/locale.ts，浏览器端复用）
 *   - manifest 元数据
 *
 * 注意：本仓库不直接出 React 组件（DSH settings UI 由 dsh-client-ui-settings-plugins
 * 自动基于 schemastery schema 渲染表单）。我们只提供"额外元数据 + locale"。
 */

import { LOCALE, TYPERT, SECTIONS } from './typert/index.js'

export const clientManifest = {
  name: '@local/dsh-channel-dingtalk/client',
  version: '0.5.0',
  /** DSH 的 client manifest 字段（参考 dsh-client-ui-* 插件的约定）*/
  contributes: {
    /** 给 settings UI 提供 section 分组 */
    'settings.sections': SECTIONS,

    /** locale 字典（zh-CN + en）*/
    'settings.locale': LOCALE,

    /** 配置健康度 banner */
    'settings.status': {
      checker: '@local/dsh-channel-dingtalk/typert/validate',
      // 浏览器侧通过 client remote 调用 checker（host 端实现）
      // dsh-client-connection 暴露的 host checkConfigStatus
    },

    /** typert manifest 元数据 */
    typert: TYPERT,
  },

  /** 暴露给 dsh-cordis-client-runner 的 hooks（用于 dsh.client 装配）*/
  hooks: {
    /**
     * 在 dsh-client-modules boot 阶段被调用。
     * dsh-client-ui-settings-plugins 会读 settings.cards / settings.locale / settings.sections
     * 来渲染"插件 → DingTalk Channel"标签页。
     */
    onSettingsMount(ctx: unknown): void {
      // ctx 是 dsh-client-modules 的 ClientContext
      // 本仓库首版不直接 mount React 组件（DSH 自动渲染）
      // 留 hook 位置给未来 PR 注入自定义 widget
    },
  },
} as const

export default clientManifest

// re-export 给 browser 端使用
export { TYPERT, SECTIONS, LOCALE } from './typert/index.js'
export type { LocaleKey } from './typert/index.js'