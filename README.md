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

凭证（只引用环境变量，不存值）：

```bash
export DINGTALK_CLIENT_ID=...
export DINGTALK_CLIENT_SECRET=...
```

---

## 开发路线

- [x] W1：fork connector 业务代码 + 剥离 OpenClaw 依赖
- [x] W2：`apply(ctx)` 主骨架 + settings/credentials
- [x] W2：stream bridge + 会话路由 + 群/私聊策略
- [x] W3：**AI Card 流式响应 + apis/messaging 完整协议层**（PR-2）
- [x] W3：**媒体上传 + 图片后处理 + send_media 工具**（PR-2）
- [x] W4：**视频/音频/文件完整主动发送流程 + marker processor**（PR-3）
- [x] W4：**runtime/ai-card.ts 接入完整 apis/streamAICard + apis/finishAICard**（PR-3）
- [ ] W5：把 6 个占位 tool（doc/sheet/calendar/task/log/ding）填充实现
- [ ] W6：typert 设置 UI + 文档
- [ ] W7-W8：稳定性、断线重连
- [ ] W9：发布与生态接入

---

## License

[MIT](LICENSE)

参考与基于：
- [DingTalk-Real-AI/dingtalk-openclaw-connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)（MIT，钉钉官方）
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)