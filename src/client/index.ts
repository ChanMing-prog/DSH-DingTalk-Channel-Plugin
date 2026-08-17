/**
 * Client (browser) entry — DSH 双面插件的浏览器侧.
 *
 * PR-6a: 完整 React 应用，让用户在 DSH Web → 设置 → 插件 → 钉钉 Channel
 * 里通过自定义 UI 编辑多账号 / bindings / groups。
 *
 * DSH Node 端扫描 `package.json` 的 `exports["./client"]` 入口，自己负责：
 *   1. 用 esbuild 把本目录 bundle 成单文件 `dist/client-card.js`
 *   2. 服务到 `/plugins/<id>.js`
 *   3. Browser 端通过 `window.__ModuleLoader__.load({ id, factory })` 加载
 *
 * 浏览器侧的 slot contract（参考 dsh-client-ui-slots）：
 *   - `settings.plugins.tab` slot 已经被 dsh-client-ui-settings-plugins 注册
 *   - 我们把 ChannelCard 组件注册到 `settings.plugin.item` slot
 *   - DSH Web 把 props（config/draft/onChange/status/locale）传给组件
 *
 * 注意：本仓库不直接 import dsh-client-ui-*，因为 DSH 的 esbuild pipeline
 * 不会把 sibling  packages 的 transitive deps 解析到我们这个 bundle 里。
 * 所有 UI 都是 plain React 18。
 */

// Inject CSS — esbuild will resolve this as a sibling file import
import './styles.css'

import { ChannelCard } from './ChannelCard.js'
import { AccountsEditor } from './AccountsEditor.js'
import { BindingsEditor } from './BindingsEditor.js'
import { GroupsEditor } from './GroupsEditor.js'
import { useT, Field, FieldShell, TextField, TextAreaField, SelectField, CheckboxField, Section, Button } from './Field.js'

import type { ChannelCardProps, DingTalkConfig, DingtalkDraft, ConfigStatus, Locale } from './types.js'

/**
 * DSH slot registration.
 *
 * `settings.plugin.item` slot 是 dsh-client-ui-settings-plugins 提供的 list slot，
 * 任何注册到它的 entry 都会成为一张可点击的"配置卡片"。
 *
 * 调用方式：DSH 在 settings → 插件 → 配置 tab 渲染时，调用
 * `window.__DSH_SLOTS__.entries('settings.plugin.item').forEach(entry => entry({ ...props }))`
 *
 * 我们的 entry 是个 React component factory，DSH 调用时拿到 React element 并 mount。
 */
const settingsPluginItem = {
  id: 'channel-dingtalk.card',
  order: 35,
  label: 'DingTalk Channel',
  component: ChannelCard,
}

const settingsPluginsTab = {
  id: 'channel-dingtalk',
  order: 35,
  label: 'DingTalk Channel',
  // sub-tab 内部页：渲染 ChannelCard
  page: ChannelCard,
}

// =============================================================================
// DSH client manifest
// =============================================================================

export const clientManifest = {
  name: '@local/dsh-channel-dingtalk/client',
  version: '0.6.0',
  /** DSH 的 client manifest 字段（参考 dsh-client-modules）*/
  contributes: {
    /** settings.plugins.tab —— 注册一个"钉钉 Channel"标签页（settings 页）*/
    'settings.plugins.tab': [settingsPluginsTab],
    /** settings.plugin.item —— 注册一张配置卡片（"插件配置"子标签页）*/
    'settings.plugin.item': [settingsPluginItem],
  },
  /** React 组件供直接 import 使用 */
  components: {
    ChannelCard,
    AccountsEditor,
    BindingsEditor,
    GroupsEditor,
  },
  /** helpers */
  utils: {
    useT,
    Field,
    FieldShell,
    TextField,
    TextAreaField,
    SelectField,
    CheckboxField,
    Section,
    Button,
  },
}

export default clientManifest

// 类型导出
export type { ChannelCardProps, DingTalkConfig, DingtalkDraft, ConfigStatus, Locale } from './types.js'
export { resolveT } from './Field.js'
export type { LocaleCode, LocaleEntry, LocaleKey } from '../typert/locale/index.js'
export { LOCALES, LOCALES_FOR_REGISTER, lookupLocale, findLocaleDivergence } from '../typert/locale/index.js'

// 组件直接 export（让 dsh-cordis-client-runner 等可以做 tree-shaking）
export { ChannelCard, AccountsEditor, BindingsEditor, GroupsEditor }
export { useT, Field, FieldShell, TextField, TextAreaField, SelectField, CheckboxField, Section, Button }

// 默认 mount 行为（直接挂载到 #root）
export function mount(el: HTMLElement, props: ChannelCardProps): void {
  // dynamic import react jsx-runtime 在 esbuild 里由 jsx:react-jsx 自动处理
  // 这里直接 require('react-dom/client') 创建 root
  // 但本仓库不依赖 react-dom —— DSH 已经全局引入了；我们用全局 ReactDOM
  const g = globalThis as unknown as { ReactDOM?: { createRoot: (el: HTMLElement) => { render: (node: unknown) => void } } }
  if (g.ReactDOM?.createRoot) {
    g.ReactDOM.createRoot(el).render(ChannelCard(props))
    return
  }
  // fallback：把 ChannelCard 渲染为静态 markup（debug）
  el.innerHTML = `<pre>ChannelCard props: ${JSON.stringify(props, null, 2)}</pre>`
}