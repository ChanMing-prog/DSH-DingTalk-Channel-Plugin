# DSH-DingTalk-Channel-Plugin

> DeepSeek Harness 的钉钉 Channel 插件。把钉钉官方 OpenClaw Connector 的钉钉能力，剥离 OpenClaw 依赖、重新封装成 DSH 原生插件。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH version](https://img.shields.io/badge/DSH-%3E%3D0.1.0--rc.6-28CF8D)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![dingtalk-stream](https://img.shields.io/badge/dingtalk-stream-2.1.4-1677FF)](https://www.npmjs.com/package/dingtalk-stream)

---

## 它做什么

把钉钉的 7 类能力接入 DeepSeek Harness（DSH）：

| 类别 | 能力 | 状态 |
|------|------|------|
| 💬 **消息收发** | 私聊/群聊接收 + 自动回复，文本/Markdown，@成员 | ✅ PR-2 |
| 🌊 **AI Card 流式** | 打字机效果，AI Card 中实时流式显示推理与回复 | ✅ PR-3（runtime 接入完整 streamAICard） |
| 🖼️ **媒体上传** | 图片/视频/音频/文件上传 + 自动发送 | ✅ PR-3（视频抽封面、音频抽时长全跑通） |
| 🎬 **视频/音频/文件 marker** | `[DINGTALK_VIDEO]` 等标记扫描 + 上传 + 独立消息 | ✅ PR-3 |
| 📄 **钉钉文档** | 创建、追加、搜索、列举 | 🟡 占位 |
| 🔔 **DING 消息** | 强提醒推送 | 🟡 占位 |
| ✅ **待办任务** | 个人/群待办 CRUD | 🟡 占位 |
| 📊 **AI 表格** | 表格与行数据读写 | 🟡 占位 |
| 📅 **日历日程** | 日程管理、参会人、忙闲 | 🟡 占位 |
| 📝 **日志** | 日报/周报提交与查询 | 🟡 占位 |

并且提供 **完整 Channel Bridge**：

```
钉钉群 ──┐
         │  dingtalk-stream  长连接 WebSocket
         ▼
   ┌──────────────────┐
   │  本插件 stream    │
   │  bridge          │
   └────────┬─────────┘
            │  ctx.agents.create({ sessionId: 'dingtalk:<conversationId>' })
            │  handle.followup({ role: 'user', ... })
            ▼
   ┌──────────────────┐  session/event  ┌──────────────┐
   │  DSH agent loop  │ ────stream────► │  AI Card 推送 │
   │  (推理 + 工具)    │                │  (钉钉端)     │
   └──────────────────┘                └──────────────┘
```

群里的消息 → 自动创建/恢复一个 DSH agent session → 把消息灌进 inbox → agent 推理 → 把流式回复写回钉钉 AI Card。

---

## 为什么不用现成的 `@dingtalk-real-ai/dingtalk-connector`

那是钉钉官方出品的 [OpenClaw channel 插件](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)（2121 stars）。它的 `peerDependencies` 是 `openclaw ≥ 2026.4.9`，**整个 `api.registerChannel`、`ctx.cfg`/`ctx.accountId`、6 个 `registerGatewayMethod`（27k 行）都紧耦合 OpenClaw SDK**。

DSH 既不提供 `openclaw` 包，也没有 channel 抽象。所以这个仓库做的是：

1. 把 connector 80% **与 OpenClaw 解耦的代码**（`dingtalk-stream`、API 调用层、媒体处理、AI Card 协议层）整段 fork 过来
2. 重新按 DSH 的插件契约封装：`apply(ctx)` + `ctx.settings` + `ctx.tools` + `ctx.agents` + `ctx.credentials`
3. 持久化用 `ctx.sessionPersistence`，长任务用 `ctx.jobs`

完整设计见 [docs/INTEGRATION.md](docs/INTEGRATION.md)。

---

## 安装（开发者模式）

```bash
# 1. 克隆仓库
git clone git@github.com:ChanMing-prog/DSH-DingTalk-Channel-Plugin.git
cd DSH-DingTalk-Channel-Plugin

# 2. 安装依赖
npm install    # 或 pnpm install

# 3. 编译
npm run build

# 4. 在 DSH 的 host composition 中加载
#    编辑 ~/.dsh/cordis.yml，加一行：
#      - id: dingtalk-channel
#        name: '/absolute/path/to/DSH-DingTalk-Channel-Plugin'
```

需要先在钉钉开放平台创建一个企业内部应用并拿到 `ClientID` / `ClientSecret`，详见 [docs/INTEGRATION.md § 配置](docs/INTEGRATION.md#33-配置-schema-schemastery不是-zod)。

---

## 配置

### 单账号场景

DSH 的 settings 配置（`~/.dsh/settings.yaml`）：

```yaml
channel-dingtalk:
  enabled: true
  defaultAccount: 'default'
  dmPolicy: 'pairing'              # 私聊默认需要配对
  groupPolicy: 'allowlist'         # 群聊默认 allowlist
  groups:
    'cXXXXXXXXXXXXXXXX':
      requireMention: true
      groupSessionScope: 'group'
  inboxWakeup: 'followup'
  streamTimeoutMs: 60000
```

### 多账号 / 多 Agent 场景（PR-4）

```yaml
channel-dingtalk:
  enabled: true
  defaultAccount: 'prod-bot'

  accounts:
    prod-bot:
      enabled: true
      name: '生产机器人'
      chatbotUserId: '$:LWCP_v1:$prodbot123'   # 钉钉侧的加密机器人 ID
      clientId: ${env:DINGTALK_PROD_BOT_CLIENT_ID}
      clientSecret: ${env:DINGTALK_PROD_BOT_CLIENT_SECRET}
      dmPolicy: 'allowlist'
      groupPolicy: 'allowlist'
      allowFrom: ['staffA', 'staffB']
      requireMention: true
      routes:
        - conversationId: 'cProdGroup1'
          agentScope: 'prod-agent'

    dev-bot:
      enabled: true
      name: '开发机器人'
      chatbotUserId: '$:LWCP_v1:$devbot456'
      clientId: ${env:DINGTALK_DEV_BOT_CLIENT_ID}
      clientSecret: ${env:DINGTALK_DEV_BOT_CLIENT_SECRET}
      groups:
        'cDevGroup1':
          requireMention: true
          groupSessionScope: 'group_sender'  # 按发送者拆 session

  bindings:
    - agentId: 'prod-agent'
      match:
        channel: 'dingtalk-connector'
        accountId: 'prod-bot'
    - agentId: 'dev-agent'
      match:
        channel: 'dingtalk-connector'
        accountId: 'dev-bot'
```

每个账号启动独立 stream DWClient，bindings 把 DSH agent scope 与钉钉账号绑定，settings 的 `routes` 进一步按 conversationId 精细化路由。

凭证（只引用环境变量，不存值）：

```bash
export DINGTALK_CLIENT_ID=...
export DINGTALK_CLIENT_SECRET=...
```

### Web 设置面板（PR-5）

`dsh-typert-loader` 自动扫描本仓库 `./typert` export 并注册到 `ctx.typert`，`dsh-client-ui-settings-plugins` 自动根据 schemastery schema 渲染表单。

打开 DSH Web → **设置 → 插件 → DingTalk Channel**，可以看到 9 个分块配置：

```
┌─ 凭证 (Credentials) ────────────────────────┐
│ Client ID     [_____________________________] │
│ Client Secret [_____________________________] │
└──────────────────────────────────────────────┘
┌─ 基本 (Basic) ───────────────────────────────┐
│ ☑ 启用                                       │
│ 默认账号 ID  [default_______________________] │
│ ☑ 启用媒体上传                                │
│ 系统提示词    [_____________________________] │
└──────────────────────────────────────────────┘
┌─ 私聊策略 (DM Policy) ───────────────────────┐
│ 私聊准入  ( ) 开放 (•) 配对 ( ) 白名单         │
│ 白名单    [staffA, staffB__________________] │
└──────────────────────────────────────────────┘
┌─ 群聊策略 (Group Policy) ────────────────────┐
│ 群聊准入  ( ) 开放 ( ) 白名单 (•) 禁用          │
│ ☑ 群聊需 @ 机器人                             │
│ 群特定配置  { cXXXX: { requireMention: ... }} │
└──────────────────────────────────────────────┘
┌─ 多账号 / 多机器人 (Multi-account) ──────────┐
│ [+ 新增账号]                                  │
│ ┌─ dev-bot ─────────────────────────────────┐ │
│ │ 启用 ☑ 友好名 [开发机器人]                  │ │
│ │ ChatbotUserId [$:LWCP_v1:$devbot456______] │ │
│ │ [展开/折叠群聊/路由配置]                    │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ prod-bot ─ ... ────────────────────────┐  │
└──────────────────────────────────────────────┘
┌─ Agent 绑定 (Bindings) ──────────────────────┐
│ [+ 新增绑定]                                  │
│ Agent ID [dev-agent] → Account ID [dev-bot]    │
│ Agent ID [pm-agent]  → Account ID [pm-bot]     │
└──────────────────────────────────────────────┘
┌─ 会话路由 (Routes) ──────────────────────────┐
│ [+ 新增路由]                                  │
│ ConversationId [cProd1] → AgentScope [prod-agent] │
└──────────────────────────────────────────────┘
┌─ Bridge 行为 ────────────────────────────────┐
│ 唤醒方式   ( ) followup (•) steer              │
│ AI Card 复用窗口 [86400000] ms                │
└──────────────────────────────────────────────┘
┌─ 消息限制 ▾ ─────────────────────────────────┐
│ 上下文历史 [50]  单消息字符 [4000]  媒体MB [20]│
└──────────────────────────────────────────────┘
```

顶部 banner 自动显示配置健康度：

- ✅ 配置正确
- ⚠️ 未配置凭证
- ⚠️ 部分账号未配置凭证: dev-bot, pm-bot
- ⚠️ 以下 bindings 引用的账号不存在: ghost

---

## 开发路线

- [x] W1：fork connector 业务代码 + 剥离 OpenClaw 依赖
- [x] W2：`apply(ctx)` 主骨架 + settings/credentials
- [x] W2：stream bridge + 会话路由 + 群/私聊策略
- [x] W3：**AI Card 流式响应 + apis/messaging 完整协议层**（PR-2）
- [x] W3：**媒体上传 + 图片后处理 + send_media 工具**（PR-2）
- [x] W4：**视频/音频/文件完整主动发送流程 + marker processor**（PR-3）
- [x] W4：**runtime/ai-card.ts 接入完整 apis/streamAICard + apis/finishAICard**（PR-3）
- [x] W5：**多账号 / 多机器人 / bindings 完整支持**（PR-4）
- [x] W5：**multi-stream bridge：每个 account 一个独立 DWClient**（PR-4）
- [x] W6：**DSH Typert settings UI（manifest + locale + sections + status）**（PR-5）
- [x] W7：**多账号 React 自定义组件（AccountsEditor / BindingsEditor / GroupsEditor）**（PR-6a）
- [x] W8：**完整 locale + DSH locale 插件的多语言注册**（PR-6b）
- [x] W9：**Typert Remote service + manifest 契约验证 + lint 脚本**（PR-6c）
- [ ] W10：把 6 个占位 tool（doc/sheet/calendar/task/log/ding）填充实现
- [ ] W11-W12：稳定性、断线重连
- [ ] W13：发布与生态接入

---

## License

[MIT](LICENSE)

参考与基于：
- [DingTalk-Real-AI/dingtalk-openclaw-connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)（MIT，钉钉官方）
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)