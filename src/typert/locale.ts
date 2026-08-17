/**
 * Locale 字典 — DSH Web 设置面板显示文案.
 *
 * 命名约定：`channel-dingtalk.<section>.<field>` —— 字段级文案
 *             `channel-dingtalk.<section>.<field>.label`
 *             `channel-dingtalk.<section>.<field>.description`
 *             `channel-dingtalk.<section>.<field>.options.<enum>` —— 枚举选项
 *
 * 由 dsh-client-ui-settings-plugins 通过 ctx.locale.t('channel-dingtalk.x.y') 渲染。
 */

export const LOCALE = {
  'zh-CN': {
    // —— 通用 ——
    'channel-dingtalk.title': '钉钉 Channel',
    'channel-dingtalk.description': '把钉钉消息桥接到 DSH agent，支持多账号、AI Card 流式、@ 机器人路由。',
    'channel-dingtalk.enabled': '启用',
    'channel-dingtalk.enabled.description': '关闭后插件不响应任何钉钉消息。',

    // —— 凭证（顶层 / 兜底账号）——
    'channel-dingtalk.credentials.title': '凭证',
    'channel-dingtalk.credentials.description': '钉钉企业内部应用的 ClientID / ClientSecret。不填则从环境变量 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET 读取。',
    'channel-dingtalk.clientId': 'Client ID',
    'channel-dingtalk.clientId.description': '钉钉开放平台创建的应用 ClientID',
    'channel-dingtalk.clientSecret': 'Client Secret',
    'channel-dingtalk.clientSecret.description': 'ClientSecret（不在 settings UI 明文展示；通过 credentials 域写入）',

    // —— 基础 ——
    'channel-dingtalk.defaultAccount': '默认账号 ID',
    'channel-dingtalk.defaultAccount.description': '未匹配到具体账号时使用的账号 ID（默认 default）',
    'channel-dingtalk.systemPrompt': '系统提示词',
    'channel-dingtalk.systemPrompt.description': '注入到 agent 的额外 system prompt',
    'channel-dingtalk.enableMediaUpload': '启用媒体上传',
    'channel-dingtalk.enableMediaUpload.description': '关闭后 agent 无法发送图片/视频/音频/文件',

    // —— 私聊策略 ——
    'channel-dingtalk.dmPolicy.title': '私聊策略',
    'channel-dingtalk.dmPolicy': '私聊准入',
    'channel-dingtalk.dmPolicy.description': '陌生私聊消息如何处理',
    'channel-dingtalk.dmPolicy.options.open': '开放（任何人可私聊）',
    'channel-dingtalk.dmPolicy.options.pairing': '配对（首次需要发送配对码）',
    'channel-dingtalk.dmPolicy.options.allowlist': '白名单（仅名单内用户）',
    'channel-dingtalk.allowFrom': '私聊白名单',
    'channel-dingtalk.allowFrom.description': '允许私聊的 staffId / userId 列表',

    // —— 群聊策略 ——
    'channel-dingtalk.groupPolicy.title': '群聊策略',
    'channel-dingtalk.groupPolicy': '群聊准入',
    'channel-dingtalk.groupPolicy.description': '陌生群聊消息如何处理',
    'channel-dingtalk.groupPolicy.options.open': '开放',
    'channel-dingtalk.groupPolicy.options.allowlist': '白名单',
    'channel-dingtalk.groupPolicy.options.disabled': '禁用',
    'channel-dingtalk.groupAllowFrom': '群聊白名单',
    'channel-dingtalk.groupAllowFrom.description': '允许群聊的 staffId / userId 列表',
    'channel-dingtalk.requireMention': '群聊需 @ 机器人',
    'channel-dingtalk.requireMention.description': '关闭后群内所有消息都会触发（不建议）',
    'channel-dingtalk.groups': '群特定配置',
    'channel-dingtalk.groups.description': '按 conversationId 精细化配置每个群',

    // —— 限制 ——
    'channel-dingtalk.limits.title': '消息限制',
    'channel-dingtalk.historyLimit': '上下文历史条数',
    'channel-dingtalk.textChunkLimit': '单消息最大字符数',
    'channel-dingtalk.mediaMaxMb': '媒体上传最大 MB',

    // —— 路由（顶层，向后兼容）——
    'channel-dingtalk.routes.title': '会话路由（顶层）',
    'channel-dingtalk.routes.description': '按 conversationId 把消息路由到指定 agent scope（agent preset 名）',

    // —— 多账号 ——
    'channel-dingtalk.accounts.title': '多账号 / 多机器人',
    'channel-dingtalk.accounts.description': '每个账号对应一个独立的钉钉企业内部应用。每个账号启动独立 stream 长连接。',
    'channel-dingtalk.accounts.add': '新增账号',
    'channel-dingtalk.accounts.accountId': '账号 ID',
    'channel-dingtalk.accounts.enabled': '启用',
    'channel-dingtalk.accounts.name': '友好名',
    'channel-dingtalk.accounts.name.description': '@提及解析时使用的别名（如"开发机器人"）',
    'channel-dingtalk.accounts.chatbotUserId': 'Chatbot User ID',
    'channel-dingtalk.accounts.chatbotUserId.description': '钉钉侧的加密机器人 ID（$:LWCP_v1:$xxx）。订阅 stream 后拿到。',

    // —— Bindings ——
    'channel-dingtalk.bindings.title': 'Agent 绑定',
    'channel-dingtalk.bindings.description': '把 DSH agent scope 绑定到钉钉账号。bindings 优先于 routes。',
    'channel-dingtalk.bindings.add': '新增绑定',
    'channel-dingtalk.bindings.agentId': 'Agent ID',
    'channel-dingtalk.bindings.matchAccountId': '账号 ID',

    // —— Bridge ——
    'channel-dingtalk.bridge.title': 'Bridge 行为',
    'channel-dingtalk.bridge.description': '控制 stream bridge 与 DSH agent loop 的对接方式。',
    'channel-dingtalk.inboxWakeup': '唤醒方式',
    'channel-dingtalk.inboxWakeup.description': 'followup（追加到下一个 turn）或 steer（插队到当前 step）',
    'channel-dingtalk.inboxWakeup.options.followup': 'followup（等当前 turn 完成）',
    'channel-dingtalk.inboxWakeup.options.steer': 'steer（插队当前 step）',
    'channel-dingtalk.streamTimeoutMs': 'AI Card 流超时 (ms)',
    'channel-dingtalk.jobsControllerName': 'Jobs Controller 名',
    'channel-dingtalk.aiCardReuseMs': 'AI Card 复用窗口 (ms)',
    'channel-dingtalk.aiCardReuseMs.description': '同一会话的 AI Card 在多长时间内复用同一实例',
    'channel-dingtalk.toolsOnly': '仅工具模式',
    'channel-dingtalk.toolsOnly.description': '关闭后不启动 stream bridge，只暴露 7 个 tool 给 agent',

    // —— 状态消息 ——
    'channel-dingtalk.status.notConfigured': '⚠️ 未配置凭证。请填入 clientId/clientSecret 或设置环境变量。',
    'channel-dingtalk.status.partialConfig': '⚠️ 部分账号未配置凭证。',
    'channel-dingtalk.status.bindingsMissing': '⚠️ 以下 bindings 引用的账号不存在：',
    'channel-dingtalk.status.allGood': '✅ 配置正确',
    'channel-dingtalk.status.accountsCount': '已启用 {count} 个账号',

    // —— 帮助 ——
    'channel-dingtalk.help.openPlatform': '在钉钉开放平台 https://open-dev.dingtalk.com 创建企业内部应用',
    'channel-dingtalk.help.qrcodeAuth': '推荐使用扫码授权（npx @dingtalk-real-ai/dingtalk-connector install）自动填充凭证',
    'channel-dingtalk.help.envVars': '环境变量：DINGTALK_<ACCOUNT>_CLIENT_ID / DINGTALK_<ACCOUNT>_CLIENT_SECRET',
    'channel-dingtalk.help.multiAccount': '多账号：每个账号启动独立 stream 长连接，bindings 把 DSH agent scope 路由到账号',
  },

  en: {
    'channel-dingtalk.title': 'DingTalk Channel',
    'channel-dingtalk.description': 'Bridge DingTalk messages to DSH agents. Multi-account, AI Card streaming, bot @-mention routing.',
    'channel-dingtalk.enabled': 'Enabled',
    'channel-dingtalk.enabled.description': 'When disabled, the plugin does not respond to any DingTalk messages.',

    'channel-dingtalk.credentials.title': 'Credentials',
    'channel-dingtalk.credentials.description': 'ClientID / ClientSecret of your DingTalk enterprise app. Falls back to env vars DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET when empty.',
    'channel-dingtalk.clientId': 'Client ID',
    'channel-dingtalk.clientId.description': 'ClientID of your DingTalk enterprise app',
    'channel-dingtalk.clientSecret': 'Client Secret',
    'channel-dingtalk.clientSecret.description': 'ClientSecret (not shown in settings UI; write through credentials domain)',

    'channel-dingtalk.defaultAccount': 'Default account ID',
    'channel-dingtalk.defaultAccount.description': 'Account ID to use when no specific account matches (default: default)',
    'channel-dingtalk.systemPrompt': 'System prompt',
    'channel-dingtalk.systemPrompt.description': 'Extra system prompt injected into the agent',
    'channel-dingtalk.enableMediaUpload': 'Enable media upload',
    'channel-dingtalk.enableMediaUpload.description': 'When disabled, agent cannot send image / video / audio / file',

    'channel-dingtalk.dmPolicy.title': 'DM policy',
    'channel-dingtalk.dmPolicy': 'DM admission',
    'channel-dingtalk.dmPolicy.description': 'How to handle DM messages from unknown users',
    'channel-dingtalk.dmPolicy.options.open': 'Open (anyone)',
    'channel-dingtalk.dmPolicy.options.pairing': 'Pairing (require pairing code)',
    'channel-dingtalk.dmPolicy.options.allowlist': 'Allowlist (only listed staff)',
    'channel-dingtalk.allowFrom': 'DM allowlist',
    'channel-dingtalk.allowFrom.description': 'staffId / userId allowed for DM',

    'channel-dingtalk.groupPolicy.title': 'Group policy',
    'channel-dingtalk.groupPolicy': 'Group admission',
    'channel-dingtalk.groupPolicy.description': 'How to handle group messages',
    'channel-dingtalk.groupPolicy.options.open': 'Open',
    'channel-dingtalk.groupPolicy.options.allowlist': 'Allowlist',
    'channel-dingtalk.groupPolicy.options.disabled': 'Disabled',
    'channel-dingtalk.groupAllowFrom': 'Group allowlist',
    'channel-dingtalk.groupAllowFrom.description': 'staffId / userId allowed for group',
    'channel-dingtalk.requireMention': 'Require @bot in group',
    'channel-dingtalk.requireMention.description': 'When enabled, group messages without @ are ignored',
    'channel-dingtalk.groups': 'Per-group config',
    'channel-dingtalk.groups.description': 'Per-conversationId group configuration',

    'channel-dingtalk.limits.title': 'Message limits',
    'channel-dingtalk.historyLimit': 'History limit (messages)',
    'channel-dingtalk.textChunkLimit': 'Text chunk limit (chars)',
    'channel-dingtalk.mediaMaxMb': 'Media upload max (MB)',

    'channel-dingtalk.routes.title': 'Session routes (top-level)',
    'channel-dingtalk.routes.description': 'Route conversationId to specific agent scope (agent preset name)',

    'channel-dingtalk.accounts.title': 'Multi-account / Multi-bot',
    'channel-dingtalk.accounts.description': 'Each account maps to a DingTalk enterprise app and runs its own stream connection.',
    'channel-dingtalk.accounts.add': 'Add account',
    'channel-dingtalk.accounts.accountId': 'Account ID',
    'channel-dingtalk.accounts.enabled': 'Enabled',
    'channel-dingtalk.accounts.name': 'Friendly name',
    'channel-dingtalk.accounts.name.description': 'Alias for @-mention parsing (e.g. "dev-bot")',
    'channel-dingtalk.accounts.chatbotUserId': 'Chatbot User ID',
    'channel-dingtalk.accounts.chatbotUserId.description': 'Encrypted DingTalk bot ID ($:LWCP_v1:$xxx). Obtained after subscribing to stream.',

    'channel-dingtalk.bindings.title': 'Agent bindings',
    'channel-dingtalk.bindings.description': 'Bind DSH agent scope to DingTalk accounts. Bindings take precedence over routes.',
    'channel-dingtalk.bindings.add': 'Add binding',
    'channel-dingtalk.bindings.agentId': 'Agent ID',
    'channel-dingtalk.bindings.matchAccountId': 'Account ID',

    'channel-dingtalk.bridge.title': 'Bridge behavior',
    'channel-dingtalk.bridge.description': 'Control stream bridge ↔ DSH agent loop interaction.',
    'channel-dingtalk.inboxWakeup': 'Wakeup mode',
    'channel-dingtalk.inboxWakeup.description': 'followup (queue for next turn) or steer (interrupt current step)',
    'channel-dingtalk.inboxWakeup.options.followup': 'followup (wait for current turn)',
    'channel-dingtalk.inboxWakeup.options.steer': 'steer (interrupt current step)',
    'channel-dingtalk.streamTimeoutMs': 'AI Card stream timeout (ms)',
    'channel-dingtalk.jobsControllerName': 'Jobs controller name',
    'channel-dingtalk.aiCardReuseMs': 'AI Card reuse window (ms)',
    'channel-dingtalk.aiCardReuseMs.description': 'How long the same AI Card instance is reused for a conversation',
    'channel-dingtalk.toolsOnly': 'Tools-only mode',
    'channel-dingtalk.toolsOnly.description': 'When enabled, no stream bridge; just expose the 7 tools to agents',

    'channel-dingtalk.status.notConfigured': '⚠️ Credentials not configured. Fill in clientId/clientSecret or set env vars.',
    'channel-dingtalk.status.partialConfig': '⚠️ Some accounts have no credentials.',
    'channel-dingtalk.status.bindingsMissing': '⚠️ Bindings reference unknown accounts:',
    'channel-dingtalk.status.allGood': '✅ Configuration looks good',
    'channel-dingtalk.status.accountsCount': '{count} account(s) enabled',

    'channel-dingtalk.help.openPlatform': 'Create an enterprise app at https://open-dev.dingtalk.com',
    'channel-dingtalk.help.qrcodeAuth': 'Recommended: scan-QR auth (npx @dingtalk-real-ai/dingtalk-connector install) auto-fills credentials',
    'channel-dingtalk.help.envVars': 'Env vars: DINGTALK_<ACCOUNT>_CLIENT_ID / DINGTALK_<ACCOUNT>_CLIENT_SECRET',
    'channel-dingtalk.help.multiAccount': 'Multi-account: each account runs its own stream connection; bindings route DSH agent scope to accounts',
  },
} as const

export type LocaleKey = keyof (typeof LOCALE)['zh-CN'] | keyof (typeof LOCALE)['en']