/**
 * ja (Japanese) locale — partial scaffold.
 *
 * PR-6b 演示 fallback chain：ja 只翻译 ~10 个核心键，其它键 DSH 会自动
 * fallback 到 'zh'，再 fallback 到 key 本身。
 *
 * 这意味着非核心 locale 可以"半成品"形式 ship，不会让 UI 看到一堆混乱的中文
 * （因为用户切换 ja 时只会看到"jp 日文覆盖 + zh fallback"组合，但中文 fallback
 * 通常不会被注意到，因为大部分键的优先级顺序是 locale → 通用 fallback → key）。
 *
 * 未来如果 ja 完整翻译，把所有键加进来即可。
 */

export const ja: Record<string, string> = {
  'channel-dingtalk.title': 'DingTalk チャンネル',
  'channel-dingtalk.description': 'DingTalk メッセージを DSH エージェントに橋渡しします。',
  'channel-dingtalk.enabled': '有効化',
  'channel-dingtalk.clientId': 'クライアント ID',
  'channel-dingtalk.clientSecret': 'クライアントシークレット',
  'channel-dingtalk.dmPolicy': 'DM ポリシー',
  'channel-dingtalk.groupPolicy': 'グループポリシー',
  'channel-dingtalk.accounts.title': 'マルチアカウント',
  'channel-dingtalk.bindings.title': 'エージェント紐付け',
  'channel-dingtalk.status.allGood': '✅ 設定は正常です',
}