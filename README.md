# DSH-DingTalk-Channel-Plugin

> DeepSeek Harness 的钉钉 Channel 插件。把钉钉官方 OpenClaw Connector 的钉钉能力，剥离 OpenClaw 依赖、重新封装成 DSH 原生插件。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH version](https://img.shields.io/badge/DSH-%3E%3D0.1.0--rc.6-28CF8D)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org)
[![dingtalk-stream](https://img.shields.io/badge/dingtalk-stream-2.1.4-1677FF)](https://www.npmjs.com/package/dingtalk-stream)

---

## 它做什么

把钉钉的核心能力接入 DeepSeek Harness（DSH）：

| 类别 | 能力 | 状态 |
|------|------|------|
| 💬 **消息收发** | 私聊/群聊接收 + 自动回复，文本/Markdown，@成员 | ✅ |
| 🌊 **AI Card 流式** | 打字机效果，AI Card 中实时流式显示推理与回复 | ✅ |
| 🖼️ **媒体上传** | 图片/视频/音频/文件上传 + 自动发送 | ✅ |
| 🎬 **视频/音频/文件 marker** | `[DINGTALK_VIDEO]` 等标记扫描 + 上传 + 独立消息 | ✅ |

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

## 安装指南

> 📖 **完整安装文档**（含 cordis.patch.yml 配置详解、agent preset 加载方式、常见问题排查）：[docs/INSTALL.md](docs/INSTALL.md)

### 前置条件

| 依赖 | 版本 | 用途 |
|------|------|------|
| [Node.js](https://nodejs.org) | ≥ 20 | 运行时 |
| [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) | ≥ 0.1.0-rc.6 | Agent 运行时 + Web UI |
| 钉钉企业内部应用 | — | 提供 ClientID / ClientSecret |
| Git | 任意 | 克隆仓库 |

### 第 1 步：创建钉钉企业内部应用

1. 打开 [钉钉开放平台开发者后台](https://open-dev.dingtalk.com/)
2. 创建**企业内部应用**（建议命名为"DSH Agent"或你希望的机器人名）
3. 进入应用详情 → **凭证与基础信息**，复制 `ClientID` 和 `ClientSecret`
4. 进入**应用能力** → **机器人**，开启机器人能力
5. 进入**版本管理与发布**，创建版本并发布（或申请测试企业）

> 💡 **推荐扫码授权**：如果你只是想快速把凭证配好，上游 connector 提供了扫码流程：
> ```bash
> npx -y @dingtalk-real-ai/dingtalk-connector install
> ```
> 扫码后凭证会自动写入配置。拿到 `ClientID` / `ClientSecret` 后回到本指南继续。

### 第 2 步：克隆并编译插件

```bash
git clone git@github.com:ChanMing-prog/DSH-DingTalk-Channel-Plugin.git \
  ~/DSH-DingTalk-Channel-Plugin

cd ~/DSH-DingTalk-Channel-Plugin
pnpm install && pnpm build
```

编译成功后，`dist/` 目录下会出现：
- `dist/apply.js` — 主入口
- `dist/client/index.js` — 浏览器端 UI（React 组件）
- `dist/typert/index.js` — Typert manifest（settings UI 自动渲染）
- `dist/tools/` — 3 个钉钉工具
- `dist/apis/` — 钉钉 API 协议层
- `dist/runtime/` — stream bridge + 稳定性层

### 第 3 步：配置凭证

**方式 A：DSH settings 文件（推荐）**

```yaml
# ~/.dsh/settings.yaml
channel-dingtalk:
  clientId: 'dingxxxxxxxxxxxxxxxx'
  clientSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

**方式 B：环境变量**（推荐放在 `~/.zshrc` / `~/.bashrc`）

```bash
export DINGTALK_CLIENT_ID='dingxxxxxxxxxxxxxxxx'
export DINGTALK_CLIENT_SECRET='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

**方式 C：Web 设置面板**（第 5 步启动 DSH 后 GUI 填写）

### 第 4 步：加载插件

**方式 A（推荐）：编辑 `cordis.patch.yml`**

编辑你使用的 profile 的 patch 文件：

```bash
vim ~/.dsh/profiles/web/cordis.patch.yml
```

在里面加一个 `- insert:` 条目：

```yaml
# DSH DingTalk Channel Plugin
# 来源：https://github.com/ChanMing-prog/DSH-DingTalk-Channel-Plugin
- insert:
    - id: dingtalk-channel
      name: '/Users/chenming/DSH-DingTalk-Channel-Plugin'
      config:
        enabled: true
        dmPolicy: 'pairing'
        groupPolicy: 'allowlist'
        requireMention: true
        inboxWakeup: 'followup'
        streamTimeoutMs: 60000
```

> ⚠️ `name` 字段必须是插件目录的**绝对路径**（不是 npm 包名），因为插件不在 npm registry 上。

**方式 B：命令行临时加载**（只对本次启动生效）

```bash
dsh web --patch /Users/chenming/DSH-DingTalk-Channel-Plugin/cordis.yml
```

### 第 5 步：启动 DSH 并验证

```bash
dsh web
```

浏览器打开 DSH Web 界面：

1. **设置 → 插件 → DingTalk Channel**：顶部 banner 应显示 ✅
2. 如凭证未配置，在这里填入 `ClientID` / `ClientSecret`

**私聊验证**：在钉钉给机器人发消息，应收到 AI Card 流式回复。

**群聊验证**：拉机器人进群，@机器人发消息，应收到 AI Card 流式回复。

### 第 6 步（可选）：Typert lint 检查

```bash
cd ~/DSH-DingTalk-Channel-Plugin
pnpm lint:typert
# 期望输出：✅ lint passed
```

---

## 配置参考

### 单账号场景

```yaml
# ~/.dsh/settings.yaml
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

### 多账号 / 多 Agent 场景

```yaml
channel-dingtalk:
  enabled: true
  defaultAccount: 'prod-bot'

  accounts:
    prod-bot:
      enabled: true
      name: '生产机器人'
      chatbotUserId: '$:LWCP_v1:$prodbot123'
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

每个账号启动独立 stream DWClient，bindings 把 DSH agent scope 与钉钉账号绑定。

---

## 架构

```
src/
├── apply.ts              # 主入口：注册 settings / credentials / tools / stream bridge
├── types.ts              # 共享类型
├── apis/                 # 钉钉 API 协议层（fork 自上游 connector）
│   ├── messaging.ts      # 顶层 facade：sendTextToDingTalk / sendMediaToDingTalk
│   ├── messaging-*.ts    # AI Card / proactive / send / types
│   ├── media.ts          # 上传：图片/视频/音频/文件
│   ├── media-*.ts        # 元数据提取 / 主动发送 / marker 处理
│   ├── accounts.ts       # 多账号凭证解析
│   ├── bindings.ts       # bindings 索引 + 反查
│   ├── mentions.ts       # 多机器人 @ 提及替换
│   └── tokens.ts         # token 缓存 + 主动续期（每 50min）
├── runtime/              # DSH runtime 层
│   ├── stream.ts         # Stream bridge 主入口（多账号）
│   ├── stability.ts      # StreamConnection（心跳 + 退避重连 + 消息去重）
│   ├── session-routing.ts# conversationId ↔ DSH SessionId 映射
│   ├── policy.ts         # 群/私聊准入策略
│   ├── ai-card.ts        # AI Card 缓存 + apis/ 桥接
│   ├── setup.ts          # settings/credentials 注册
│   └── jobs-controller.ts# DSH jobs controller 注册
├── tools/                # DSH tools（agent 可调用）
│   ├── dingtalk_send.ts         # 文本/Markdown/图片发送
│   ├── dingtalk_send_media.ts   # 本地媒体文件发送
│   └── dingtalk_process_markers.ts  # marker 处理 + 发送
├── typert/               # DSH Web 设置面板
│   ├── manifest.ts       # TYPERT 常量（slot 贡献声明）
│   ├── locale/           # 多语言字典（zh/en/ja）
│   ├── sections.ts       # 9 个配置分块
│   ├── validate.ts       # 配置健康度检查
│   ├── reflect.ts        # ConfigStatusService（Typert Remote service）
│   ├── loader-contract.ts# manifest + schema + locale 一致性验证
│   └── schema-fields.ts  # 顶层 schema 字段常量
├── client/               # 浏览器端 React 组件
│   ├── ChannelCard.tsx   # 根卡片（settings UI）
│   ├── AccountsEditor.tsx# 多账号 CRUD
│   ├── BindingsEditor.tsx# 绑定编辑
│   ├── GroupsEditor.tsx  # 群配置编辑
│   ├── Field.tsx         # 共享字段渲染器
│   └── styles.css        # scoped CSS
└── utils/
    ├── logger.ts         # 带 namespace 的 logger
    └── http-client.ts    # 共享 axios 实例 + 钉钉 errcode 翻译
```

---

## 稳定性

- **心跳检测**：10s ping → 20s 超时 → 指数退避重连（`1s × 2^attempt`，cap 30s）
- **即时重连**：WebSocket close / 钉钉 `disconnect` topic → 立即重连（不退避）
- **AI 长任务保护**：消息处理期间每 15s 刷新心跳，防止工具执行期间误触发重连
- **消息去重**：双层（protocol `headers.messageId` + business `data.msgId`），5min TTL
- **Token 主动续期**：每 50min 刷新 `accessToken`（2h 有效期前 10min），防止 AI Card 流式中途过期

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
- [x] W10：删除 6 个不适用占位 tool（PR-7）
- [x] W11：**StreamConnection + 心跳 + 退避重连 + 消息去重 + token 主动续期**（PR-8）
- [x] W12：**README 安装指南**（PR-9）

---

## License

[MIT](LICENSE)

参考与基于：
- [DingTalk-Real-AI/dingtalk-openclaw-connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)（MIT，钉钉官方）
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)