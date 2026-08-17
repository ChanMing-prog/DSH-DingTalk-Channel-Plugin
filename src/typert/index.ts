/**
 * Typert Manifest — DSH settings UI 面板声明
 *
 * 由 @deepseek-ai/dsh-typert-loader 自动扫描 ./typert export。
 * 本文件声明 channel-dingtalk 在 Web 设置面板里需要的卡片、locale 字典、
 * 占位符。
 *
 * 当前是占位实现，下个 PR 会填充完整 Typert 描述符。
 */

export const TYPERT = {
  id: 'channel-dingtalk-settings',
  version: '0.1.0',
  // 卡片贡献：dsh-client-ui-settings-plugins 的 settings.plugin.item 槽位
  contributions: {
    'settings.plugin.item': {
      order: 35,
      label: { 'zh-CN': '钉钉 Channel', en: 'DingTalk Channel' },
      description: {
        'zh-CN': '把钉钉消息桥接到 DSH agent，支持 AI Card 流式回复。',
        en: 'Bridge DingTalk messages to DSH agents, with AI Card streaming replies.',
      },
      // 实际渲染交给 settings-cards 插件（不在本仓库 scope）
      renderSlot: 'channel-dingtalk.settings-card',
    },
  },
  // locale 字典
  locale: {
    'zh-CN': {
      'channel-dingtalk.title': '钉钉 Channel',
      'channel-dingtalk.enabled': '启用',
      'channel-dingtalk.dmPolicy': '私聊策略',
      'channel-dingtalk.groupPolicy': '群聊策略',
      'channel-dingtalk.inboxWakeup': '唤醒方式',
      'channel-dingtalk.clientId': 'ClientID',
      'channel-dingtalk.clientSecret': 'ClientSecret',
    },
    en: {
      'channel-dingtalk.title': 'DingTalk Channel',
      'channel-dingtalk.enabled': 'Enabled',
      'channel-dingtalk.dmPolicy': 'DM policy',
      'channel-dingtalk.groupPolicy': 'Group policy',
      'channel-dingtalk.inboxWakeup': 'Inbox wakeup',
      'channel-dingtalk.clientId': 'Client ID',
      'channel-dingtalk.clientSecret': 'Client secret',
    },
  },
} as const

export default TYPERT