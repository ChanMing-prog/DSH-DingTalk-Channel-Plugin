/**
 * zh (Chinese — Simplified) locale dictionary.
 *
 * Base locale — DSH 的 dsh-client-locale 在查找 key 时 fallback 到 'zh'，
 * 所以本字典覆盖所有字段。其他 locale 可以只翻译子集。
 *
 * 命名约定：
 *   - `channel-dingtalk.<section>.<field>` 字段级文案
 *   - `channel-dingtalk.<section>.<field>.options.<enum>` 枚举选项
 *   - `channel-dingtalk.status.<kind>` 状态条
 *   - `channel-dingtalk.help.<topic>` 帮助
 */

export const zh: Record<string, string> = {
  // —— 通用 ——
  'channel-dingtalk.title': '钉钉 Channel',
  'channel-dingtalk.description':
    '把钉钉消息桥接到 DSH agent，支持多账号、AI Card 流式、@ 机器人路由。',
  'channel-dingtalk.enabled': '启用',
  'channel-dingtalk.enabled.description': '关闭后插件不响应任何钉钉消息。',

  // —— 凭证 ——
  'channel-dingtalk.credentials.title': '凭证',
  'channel-dingtalk.credentials.description':
    '钉钉企业内部应用的 ClientID / ClientSecret。不填则从环境变量 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET 读取。',
  'channel-dingtalk.clientId': 'Client ID',
  'channel-dingtalk.clientId.description': '钉钉开放平台创建的应用 ClientID',
  'channel-dingtalk.clientSecret': 'Client Secret',
  'channel-dingtalk.clientSecret.description':
    'ClientSecret（不在 settings UI 明文展示；通过 credentials 域写入）',

  // —— 基本 ——
  'channel-dingtalk.defaultAccount': '默认账号 ID',
  'channel-dingtalk.defaultAccount.description':
    '未匹配到具体账号时使用的账号 ID（默认 default）',
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
  'channel-dingtalk.requireMention.description':
    '关闭后群内所有消息都会触发（不建议）',
  'channel-dingtalk.groups.title': '群特定配置',
  'channel-dingtalk.groups.description': '按 conversationId 精细化配置每个群',
  'channel-dingtalk.groups.add': '新增群配置',
  'channel-dingtalk.groups.empty': '暂无群配置',
  'channel-dingtalk.groups.confirmDelete': '确定删除群配置 {id}?',
  'channel-dingtalk.groupSessionScope': '会话作用域',
  'channel-dingtalk.groupSessionScope.options.group': 'group（共享 session）',
  'channel-dingtalk.groupSessionScope.options.group_sender': 'group_sender（按发送者拆）',

  // —— 限制 ——
  'channel-dingtalk.limits.title': '消息限制',
  'channel-dingtalk.historyLimit': '上下文历史条数',
  'channel-dingtalk.textChunkLimit': '单消息最大字符数',
  'channel-dingtalk.mediaMaxMb': '媒体上传最大 MB',

  // —— 路由（顶层，向后兼容）——
  'channel-dingtalk.routes.title': '会话路由（顶层）',
  'channel-dingtalk.routes.description':
    '按 conversationId 把消息路由到指定 agent ID（bindings 优先）',

  // —— 多账号 ——
  'channel-dingtalk.accounts.title': '多账号 / 多机器人',
  'channel-dingtalk.accounts.description':
    '每个账号对应一个独立的钉钉企业内部应用。每个账号启动独立 stream 长连接。',
  'channel-dingtalk.accounts.add': '新增账号',
  'channel-dingtalk.accounts.confirmDelete': '确定删除账号 {id}?',
  'channel-dingtalk.accounts.empty': '暂无账号配置',
  'channel-dingtalk.accounts.disabled': '已禁用',
  'channel-dingtalk.accounts.accountId': '账号 ID',
  'channel-dingtalk.accounts.enabled': '启用',
  'channel-dingtalk.accounts.name': '友好名',
  'channel-dingtalk.accounts.name.description':
    '@ 提及解析时使用的别名（如"开发机器人"）',
  'channel-dingtalk.accounts.chatbotUserId': 'Chatbot User ID',
  'channel-dingtalk.accounts.chatbotUserId.description':
    '钉钉侧的加密机器人 ID（$:LWCP_v1:$xxx）。订阅 stream 后拿到。',

  // —— Bindings ——
  'channel-dingtalk.bindings.title': 'Agent 绑定',
  'channel-dingtalk.bindings.description':
    '把 DSH agent ID 绑定到钉钉账号。bindings 优先于 routes。',
  'channel-dingtalk.bindings.add': '新增绑定',
  'channel-dingtalk.bindings.empty': '暂无绑定',
  'channel-dingtalk.bindings.agentId': 'Agent ID',
  'channel-dingtalk.bindings.matchAccountId': '账号 ID',

  // —— Bridge ——
  'channel-dingtalk.bridge.title': 'Bridge 行为',
  'channel-dingtalk.bridge.description': '控制 stream bridge 与 DSH agent loop 的对接方式。',
  'channel-dingtalk.inboxWakeup': '唤醒方式',
  'channel-dingtalk.inboxWakeup.description':
    'followup（追加到下一个 turn）或 steer（插队到当前 step）',
  'channel-dingtalk.inboxWakeup.options.followup': 'followup（等当前 turn 完成）',
  'channel-dingtalk.inboxWakeup.options.steer': 'steer（插队当前 step）',
  'channel-dingtalk.streamTimeoutMs': 'AI Card 流超时 (ms)',
  'channel-dingtalk.jobsControllerName': 'Jobs Controller 名',
  'channel-dingtalk.aiCardReuseMs': 'AI Card 复用窗口 (ms)',
  'channel-dingtalk.aiCardReuseMs.description': '同一会话的 AI Card 在多长时间内复用同一实例',
  'channel-dingtalk.toolsOnly': '仅工具模式',
  'channel-dingtalk.toolsOnly.description': '关闭后不启动 stream bridge，只暴露 7 个 tool 给 agent',

  // —— 状态 ——
  'channel-dingtalk.status.notConfigured': '⚠️ 未配置凭证。请填入 clientId/clientSecret 或设置环境变量。',
  'channel-dingtalk.status.partialConfig': '⚠️ 部分账号未配置凭证',
  'channel-dingtalk.status.bindingsMissing': '⚠️ 以下 bindings 引用的账号不存在：',
  'channel-dingtalk.status.allGood': '✅ 配置正确',
  'channel-dingtalk.status.accountsCount': '已启用 {count} 个账号',

  // —— 帮助 ——
  'channel-dingtalk.help.openPlatform':
    '在钉钉开放平台 https://open-dev.dingtalk.com 创建企业内部应用',
  'channel-dingtalk.help.qrcodeAuth':
    '推荐使用扫码授权（npx @dingtalk-real-ai/dingtalk-connector install）自动填充凭证',
  'channel-dingtalk.help.envVars':
    '环境变量：DINGTALK_<ACCOUNT>_CLIENT_ID / DINGTALK_<ACCOUNT>_CLIENT_SECRET',
  'channel-dingtalk.help.multiAccount':
    '多账号：每个账号启动独立 stream 长连接，bindings 把 DSH agent ID 路由到账号',
}