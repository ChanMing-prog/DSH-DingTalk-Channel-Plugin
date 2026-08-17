/**
 * Client (browser) entry — DSH 双面插件的浏览器侧
 *
 * 命名对应 dsh-client-* 的约定。本仓库不直接出浏览器 UI（agent 对话 UI 由
 * dsh-client-ui-conversation 负责），这里只提供设置面板需要的元数据 + locale。
 *
 * 占位实现。后续 PR 接入完整的 dsh-client-ui-* 体系。
 */

export const clientManifest = {
  // dsh.client manifest 字段（参考 dsh-client-ui-* 插件的约定）
  name: '@local/dsh-channel-dingtalk/client',
  version: '0.1.0',
  contributes: {
    'settings.cards': [
      {
        id: 'channel-dingtalk.settings-card',
        ns: 'channel-dingtalk',
        order: 35,
        // 占位；实际渲染由 settings-cards 插件读取 schema + section 自动生成
        fallback: {
          type: 'description',
          text: 'Channel-dingtalk settings are exposed via the schema registered by the host plugin.',
        },
      },
    ],
  },
} as const

export default clientManifest