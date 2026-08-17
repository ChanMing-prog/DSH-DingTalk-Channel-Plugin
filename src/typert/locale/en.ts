/**
 * en (English) locale dictionary.
 *
 * PR-6b: 完整翻译版本，覆盖所有 80+ 键。
 *
 * DSH 的查找链：active locale → 'zh' fallback → common fallback → key 本身。
 * 所以本字典不必和 zh 完全键对键 —— DSH 会自动 fallback。
 * 但为了避免用户切换到英文后看到一堆中文 fallback，我们尽量保证键的完整镜像。
 */

export const en: Record<string, string> = {
  // —— 通用 ——
  'channel-dingtalk.title': 'DingTalk Channel',
  'channel-dingtalk.description':
    'Bridge DingTalk messages to DSH agents. Multi-account, AI Card streaming, bot @-mention routing.',
  'channel-dingtalk.enabled': 'Enabled',
  'channel-dingtalk.enabled.description':
    'When disabled, the plugin does not respond to any DingTalk messages.',

  // —— Credentials ——
  'channel-dingtalk.credentials.title': 'Credentials',
  'channel-dingtalk.credentials.description':
    'ClientID / ClientSecret of your DingTalk enterprise app. Falls back to env vars DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET when empty.',
  'channel-dingtalk.clientId': 'Client ID',
  'channel-dingtalk.clientId.description': 'ClientID of your DingTalk enterprise app',
  'channel-dingtalk.clientSecret': 'Client Secret',
  'channel-dingtalk.clientSecret.description':
    'ClientSecret (not shown in settings UI; write through credentials domain)',

  // —— Basic ——
  'channel-dingtalk.defaultAccount': 'Default account ID',
  'channel-dingtalk.defaultAccount.description':
    'Account ID to use when no specific account matches (default: default)',
  'channel-dingtalk.systemPrompt': 'System prompt',
  'channel-dingtalk.systemPrompt.description': 'Extra system prompt injected into the agent',
  'channel-dingtalk.enableMediaUpload': 'Enable media upload',
  'channel-dingtalk.enableMediaUpload.description':
    'When disabled, agent cannot send image / video / audio / file',

  // —— DM policy ——
  'channel-dingtalk.dmPolicy.title': 'DM policy',
  'channel-dingtalk.dmPolicy': 'DM admission',
  'channel-dingtalk.dmPolicy.description': 'How to handle DM messages from unknown users',
  'channel-dingtalk.dmPolicy.options.open': 'Open (anyone)',
  'channel-dingtalk.dmPolicy.options.pairing': 'Pairing (require pairing code)',
  'channel-dingtalk.dmPolicy.options.allowlist': 'Allowlist (only listed staff)',
  'channel-dingtalk.allowFrom': 'DM allowlist',
  'channel-dingtalk.allowFrom.description': 'staffId / userId allowed for DM',

  // —— Group policy ——
  'channel-dingtalk.groupPolicy.title': 'Group policy',
  'channel-dingtalk.groupPolicy': 'Group admission',
  'channel-dingtalk.groupPolicy.description': 'How to handle group messages',
  'channel-dingtalk.groupPolicy.options.open': 'Open',
  'channel-dingtalk.groupPolicy.options.allowlist': 'Allowlist',
  'channel-dingtalk.groupPolicy.options.disabled': 'Disabled',
  'channel-dingtalk.groupAllowFrom': 'Group allowlist',
  'channel-dingtalk.groupAllowFrom.description': 'staffId / userId allowed for group',
  'channel-dingtalk.requireMention': 'Require @bot in group',
  'channel-dingtalk.requireMention.description':
    'When enabled, group messages without @ are ignored',
  'channel-dingtalk.groups.title': 'Per-group config',
  'channel-dingtalk.groups.description': 'Per-conversationId group configuration',
  'channel-dingtalk.groups.add': 'Add group',
  'channel-dingtalk.groups.empty': 'No groups configured',
  'channel-dingtalk.groups.confirmDelete': 'Delete group {id}?',
  'channel-dingtalk.groupSessionScope': 'Session scope',
  'channel-dingtalk.groupSessionScope.options.group': 'group (shared)',
  'channel-dingtalk.groupSessionScope.options.group_sender': 'group_sender (per sender)',

  // —— Limits ——
  'channel-dingtalk.limits.title': 'Message limits',
  'channel-dingtalk.historyLimit': 'History limit (messages)',
  'channel-dingtalk.textChunkLimit': 'Text chunk limit (chars)',
  'channel-dingtalk.mediaMaxMb': 'Media upload max (MB)',

  // —— Routes (top-level, backward-compat) ——
  'channel-dingtalk.routes.title': 'Session routes (top-level)',
  'channel-dingtalk.routes.description':
    'Route conversationId to a specific agent ID (bindings take precedence)',

  // —— Multi-account ——
  'channel-dingtalk.accounts.title': 'Multi-account / Multi-bot',
  'channel-dingtalk.accounts.description':
    'Each account maps to a DingTalk enterprise app and runs its own stream connection.',
  'channel-dingtalk.accounts.add': 'Add account',
  'channel-dingtalk.accounts.confirmDelete': 'Delete account {id}?',
  'channel-dingtalk.accounts.empty': 'No accounts configured',
  'channel-dingtalk.accounts.disabled': 'disabled',
  'channel-dingtalk.accounts.accountId': 'Account ID',
  'channel-dingtalk.accounts.enabled': 'Enabled',
  'channel-dingtalk.accounts.name': 'Friendly name',
  'channel-dingtalk.accounts.name.description':
    'Alias for @-mention parsing (e.g. "dev-bot")',
  'channel-dingtalk.accounts.chatbotUserId': 'Chatbot User ID',
  'channel-dingtalk.accounts.chatbotUserId.description':
    'Encrypted DingTalk bot ID ($:LWCP_v1:$xxx). Obtained after subscribing to stream.',

  // —— Bindings ——
  'channel-dingtalk.bindings.title': 'Agent bindings',
  'channel-dingtalk.bindings.description':
    'Bind DSH agent IDs to DingTalk accounts. Bindings take precedence over routes.',
  'channel-dingtalk.bindings.add': 'Add binding',
  'channel-dingtalk.bindings.empty': 'No bindings',
  'channel-dingtalk.bindings.agentId': 'Agent ID',
  'channel-dingtalk.bindings.matchAccountId': 'Account ID',

  // —— Bridge ——
  'channel-dingtalk.bridge.title': 'Bridge behavior',
  'channel-dingtalk.bridge.description':
    'Control stream bridge ↔ DSH agent loop interaction.',
  'channel-dingtalk.inboxWakeup': 'Wakeup mode',
  'channel-dingtalk.inboxWakeup.description':
    'followup (queue for next turn) or steer (interrupt current step)',
  'channel-dingtalk.inboxWakeup.options.followup': 'followup (wait for current turn)',
  'channel-dingtalk.inboxWakeup.options.steer': 'steer (interrupt current step)',
  'channel-dingtalk.streamTimeoutMs': 'AI Card stream timeout (ms)',
  'channel-dingtalk.jobsControllerName': 'Jobs controller name',
  'channel-dingtalk.aiCardReuseMs': 'AI Card reuse window (ms)',
  'channel-dingtalk.aiCardReuseMs.description':
    'How long the same AI Card instance is reused for a conversation',
  'channel-dingtalk.toolsOnly': 'Tools-only mode',
  'channel-dingtalk.toolsOnly.description':
    'When enabled, no stream bridge; just expose the 7 tools to agents',

  // —— Status banners ——
  'channel-dingtalk.status.notConfigured':
    '⚠️ Credentials not configured. Fill in clientId/clientSecret or set env vars.',
  'channel-dingtalk.status.partialConfig': '⚠️ Some accounts have no credentials',
  'channel-dingtalk.status.bindingsMissing': '⚠️ Bindings reference unknown accounts:',
  'channel-dingtalk.status.allGood': '✅ Configuration looks good',
  'channel-dingtalk.status.accountsCount': '{count} account(s) enabled',

  // —— Help ——
  'channel-dingtalk.help.openPlatform':
    'Create an enterprise app at https://open-dev.dingtalk.com',
  'channel-dingtalk.help.qrcodeAuth':
    'Recommended: scan-QR auth (npx @dingtalk-real-ai/dingtalk-connector install) auto-fills credentials',
  'channel-dingtalk.help.envVars':
    'Env vars: DINGTALK_<ACCOUNT>_CLIENT_ID / DINGTALK_<ACCOUNT>_CLIENT_SECRET',
  'channel-dingtalk.help.multiAccount':
    'Multi-account: each account runs its own stream connection; bindings route DSH agent IDs to accounts',
}