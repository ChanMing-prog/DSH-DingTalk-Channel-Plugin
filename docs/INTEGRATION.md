# 钉钉 OpenClaw Connector → DeepSeek Harness 集成方案

> 目标仓库：[DingTalk-Real-AI/dingtalk-openclaw-connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)
> 目标包：`@dingtalk-real-ai/dingtalk-connector`（v0.8.24，MIT）
> 目标平台：DeepSeek Harness (`@deepseek-ai/dsh` v0.1.0-rc.6)

---

## 0. TL;DR

**结论：不能直接安装，必须改写。** connector 是 OpenClaw 平台的 channel 插件（`peerDependencies: openclaw ≥ 2026.4.9`），DSH 既不提供 `openclaw` 包，也没有 `ChannelPlugin` / `registerChannel` 这类抽象。

但 connector 80% 的代码（钉钉 API 调用层、`dingtalk-stream` 长连接、AI Card 流式、文档/表格/日历/待办/日志的 OpenAPI 封装）与 OpenClaw 解耦，**可以整段 fork 过来重写胶水层**。

目标产物：一个本地 DSH 插件包 **`@local/dsh-channel-dingtalk`**（暂定名），提供：
1. **7 个钉钉工具**（`dingtalk_send`、`dingtalk_doc_*`、`dingtalk_sheet_*`、`dingtalk_calendar_*`、`dingtalk_task_*`、`dingtalk_log_*`），让 DSH agent 在 session 里直接调用。
2. **完整 channel bridge**：钉钉群里 @机器人 → 自动创建/恢复一个 DSH agent session → 把消息灌进 inbox → agent 推理 → 把流式回复写回钉钉 AI Card。

---

## 1. 仓库现状（已实测）

### 1.1 connector 内部结构（src/）

```
src/
├── channel.ts               # 552 行：ChannelPlugin 主实现
├── config/{schema,accounts}
├── core/provider.ts          # 钉钉 Stream provider 生命周期
├── services/
│   ├── messaging/index.ts    # 文本/Markdown/富媒体发送（OpenClaw 解耦 ✓）
│   ├── card-bridge.ts        # 11k：AI Card 流式桥接（OpenClaw 耦合 ✗）
│   └── media.ts              # 媒体上传/下载
├── sdk/helpers.ts            # 4 个 helper（OpenClaw 耦合）
├── gateway-methods.ts        # 27k：6 个 OpenClaw gateway method
├── onboarding.ts             # 扫码 OAuth UI
├── directory.ts / probe.ts / targets.ts
├── docs.ts / calendar*/task*/sheet*/log*
├── runtime.ts                # setDingtalkRuntime(runtime)
└── utils/{logger,http-client,...}
```

### 1.2 与 OpenClaw SDK 的耦合点（实测 14 处）

| 耦合 | 文件 | 行数 |
|---|---|---|
| `import { OpenClawPluginApi, ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk"` | `index.ts`, `channel.ts` | 主类型 |
| `api.registerChannel({ plugin })` | `index.ts` | 注册入口 |
| `api.runtime` / `setDingtalkRuntime(api.runtime)` | `runtime.ts`, `index.ts` | runtime 注入 |
| `ctx.cfg` / `ctx.accountId` / `ctx.abortSignal` / `ctx.log` / `ctx.setStatus` | `channel.ts` (552) | channel ctx |
| `api.registerGatewayMethod` × 6 | `gateway-methods.ts` (27k) | 网关方法 |
| `defineBundledChannelEntry` (fork 兼容) | `entry-bundled.ts` | 备用入口 |
| `buildChannelConfigSchema(zod)` (Issue #527 workaround) | `channel.ts` 末尾 | schema 构造 |
| `createDefaultChannelRuntimeState`、`resolveAllowlistProviderRuntimeGroupPolicy`、`resolveDefaultGroupPolicy` | `sdk/helpers.ts` | runtime helper |

### 1.3 与 OpenClaw 解耦的部分（可直接复用）

- `dingtalk-stream@2.1.4`（钉钉官方 stream SDK，5MB 长连接 WebSocket）
- `axios`、`form-data`、`qrcode-terminal`
- `mammoth`（可选，docx 解析）
- `services/messaging/` 全部 36k 行的发送逻辑
- `services/media/` 37k 行的上传/下载逻辑
- `services/card-bridge.ts` 里 AI Card 的**协议层**（OpenClaw 桥接部分要重写）
- `docs.ts` / `sheet*` / `calendar*` / `task*` / `log*` 等 OpenAPI 封装

---

## 2. DSH 这边的接口面（已实测）

DSH 没有"channel"概念。能力按以下 seam 装配：

| Seam | 包 | key | 用途 |
|---|---|---|---|
| 插件清单 | `@cordisjs/plugin-loader` + `cordis.yml` | `ctx.loader` | 通过 `cordis.yml` 行装配 |
| 设置 | `@deepseek-ai/dsh-settings` | `ctx.settings` | 命名空间注册 + schemastery schema |
| 凭据 | `@deepseek-ai/dsh-credentials` | `ctx.credentials` | 仅引用密钥，不持有值 |
| 工具 | `@deepseek-ai/dsh-tools` | `ctx.tools` | 模型可调用工具的注册表 |
| Web | `@deepseek-ai/dsh-web` | `ctx.web` | web search/fetch 提供方 |
| LLM | `@deepseek-ai/dsh-llm` | `ctx.llm` | 模型路由（与本任务无关） |
| Agent | `@deepseek-ai/dsh-agent` + `dsh-agent-loop` | `ctx.agents` | **入站消息对接面** |
| Session | `@deepseek-ai/dsh-session` | `ctx.sessions` | event-sourced session log |
| Persistence | `@deepseek-ai/dsh-session-persistence` (+ jsonl/sqlite) | `ctx.sessionPersistence` | 会话持久化（必须） |
| Jobs | `@deepseek-ai/dsh-jobs` + `dsh-jobs-local` | `ctx.jobs` | 长任务注册（**用于钉钉 stream**） |
| Settings UI | `@deepseek-ai/dsh-typert-loader` | `ctx.typert` | 通过 `./typert` 暴露给 Web 设置面板 |
| 浏览器 manifest | `dsh.client` manifest | — | 客户端插件声明 |

### 2.1 Agent 入站对接面（IM 桥接的关键）

`@deepseek-ai/dsh-agent-loop` 提供的 inbox：
- `agent.send(target, message, options?)` — 路由到 `followup`/`steer`/`inject`
- `agent.followup(message)` — 追加到 next-turn FIFO **并唤醒 driver**
- `agent.steer(message)` — 追加到 next-step inbox 并唤醒
- `agent.inject(message)` — 同上但不唤醒
- 事件：`agent/inbox/spliced`、`agent/inbox/inserted`、`agent/inbox/discarded`、`agent/inbox/claimed`

**IM 桥接的核心 = 每个钉钉群/私聊 → 映射到一个 `SessionId` → 每次新消息 → 找到/创建 agent handle → `followup()` 把消息灌进去。**

### 2.2 创建 / 恢复 agent

```ts
// 新建（首次 @机器人）
const handle = await ctx.agents.create({
  sessionId: 'dingtalk:cXXXXXX',  // 稳定 id，下次自动恢复
  meta: { cwd: DSH_HOME },
  setup: (agentCtx) => {
    // 注册该 agent 的专属 tool/persona
  },
})

// 恢复（已有 session）
const handle = await ctx.agents.resume({
  resumeSessionId: 'dingtalk:cXXXXXX',
})
```

要求：必须先有 `ctx.sessionPersistence`（`dsh-session-persistence-jsonl` 即可）。

---

## 3. 集成方案（最终形态）

### 3.1 包结构

```
dsh-channel-dingtalk/
├── package.json
│   ├── name: "@local/dsh-channel-dingtalk"
│   ├── peerDependencies:
│   │   ├── "@deepseek-ai/dsh-session": "*"
│   │   ├── "@deepseek-ai/dsh-agent": "*"
│   │   ├── "@deepseek-ai/dsh-agent-loop": "*"
│   │   ├── "@deepseek-ai/dsh-jobs-local": "*"
│   │   ├── "@deepseek-ai/dsh-tools": "*"
│   │   ├── "@deepseek-ai/dsh-settings": "*"
│   │   └── "dingtalk-stream": "^2.1.4"
│   ├── dependencies: { dingtalk-stream, axios, form-data, qrcode-terminal, zod }
│   └── main: ./dist/apply.js
├── cordis.yml                 # DSH 装配入口
├── settings-schema.ts         # schemastery schema（不是 zod！）
├── typert/index.ts            # 设置 UI 卡片（可选）
├── README.md
└── src/
    ├── apply.ts               # 默认导出 apply(ctx)
    ├── auth.ts                # 扫码 OAuth（fork 自 device-auth.ts）
    ├── runtime/
    │   ├── stream.ts          # dingtalk-stream 订阅（fork 自 core/provider.ts）
    │   ├── ai-card.ts         # AI Card 流式协议（fork 自 services/card-bridge.ts 协议层）
    │   └── session-routing.ts # 钉钉消息 ↔ DSH Session 映射
    ├── apis/                  # 钉钉 OpenAPI 客户端（全部 fork 自 services/*）
    │   ├── messaging.ts       # 文本/Markdown/富媒体发送
    │   ├── media.ts           # 上传/下载
    │   ├── docs.ts            # 钉钉文档
    │   ├── sheet.ts           # AI 表格
    │   ├── calendar.ts        # 日历日程
    │   ├── task.ts            # 待办
    │   └── log.ts             # 日报/周报
    ├── tools/                 # 模型可调用工具
    │   ├── dingtalk_send.ts
    │   ├── dingtalk_doc_*.ts
    │   ├── dingtalk_sheet_*.ts
    │   ├── dingtalk_calendar_*.ts
    │   ├── dingtalk_task_*.ts
    │   └── dingtalk_log_*.ts
    └── utils/{logger,http-client,secret-input}
```

### 3.2 `apply(ctx)` 骨架

```ts
// src/apply.ts
import type { Context } from 'cordis'
import { registerSettings } from './settings-schema'
import { registerTools } from './tools'
import { startDingtalkStreamBridge } from './runtime/stream'
import { createDeviceAuth } from './auth'

export default function apply(ctx: Context) {
  // 1. 注册设置 namespace（schemastery）
  registerSettings(ctx)

  // 2. 启动扫码 OAuth（仅当缺少凭证时主动提示）
  createDeviceAuth(ctx).ensureCredentials()

  // 3. 把钉钉能力封装成 DSH tools
  for (const tool of buildDingtalkTools(ctx)) {
    ctx.tools.register(tool)
  }

  // 4. 启动 stream bridge（消费 dingtalk-stream 事件）
  const stopBridge = startDingtalkStreamBridge(ctx)

  // 5. fiber 卸载时清理
  ctx.effect(() => () => stopBridge())
}
```

### 3.3 Stream Bridge 核心逻辑（最长的一段）

钉钉 stream 进来的每条消息做这件事：

```ts
// src/runtime/stream.ts (伪代码)
export function startDingtalkStreamBridge(ctx) {
  const stream = openDingtalkStream({
    clientId: ctx.credentials.read('clientId'),
    clientSecret: ctx.credentials.read('clientSecret'),
  })

  stream.on('message', async (msg: DingtalkInboundMessage) => {
    const sessionId = `dingtalk:${msg.conversationId}` // 私聊/群用 conversationId

    // 1. 取得或创建 agent handle
    let handle = ctx.agents.findBySessionId(sessionId)
    if (!handle) {
      handle = await ctx.agents.create({
        sessionId,
        meta: { cwd: ctx.shellEnv.DSH_HOME },
        setup: (agentCtx) => installChannelTools(agentCtx),
      })
    }

    // 2. 创建/复用 AI Card 实例（钉钉端）
    const card = await aiCard.create(msg.conversationId, {
      status: 'thinking',
      title: '正在思考...',
    })

    // 3. 把用户消息灌进 agent inbox（唤醒 driver）
    handle.followup({
      role: 'user',
      content: [{ type: 'text', text: msg.text }],
      source: { kind: 'dingtalk', senderId: msg.senderId, ... },
    })

    // 4. 订阅 session/event 把流式输出写回钉钉 AI Card
    const unsubscribe = handle.session.on('session/event', (event) => {
      if (event.type === 'assistant/chunk' && event.kind === 'text') {
        aiCard.append(card.id, event.delta)  // 流式 delta
      } else if (event.type === 'assistant/message') {
        aiCard.complete(card.id, event.content)
      }
    })

    // 5. 工具调用要在 AI Card 里渲染按钮
    handle.on('agent/inbox/claimed', ({ message }) => {
      if (message.tool) aiCard.renderToolCall(card.id, message.tool)
    })

    // 6. 关闭订阅（消息处理完一次后解绑，下条消息重新绑）
    // 通过 handle.awaitIdle() 等
    await handle.awaitIdle()
    unsubscribe()
  })

  return () => stream.close()
}
```

### 3.4 配置 schema（schemastery，不是 zod）

```ts
// settings-schema.ts
import { Schema } from '@deepseek-ai/dsh-settings'

export const ChannelDingtalkSettings = Schema.object({
  enabled: Schema.boolean().default(true),
  defaultAccount: Schema.string().default('default'),
  clientId: Schema.union([Schema.string(), Schema.number()]).optional(),
  clientSecret: Schema.secret().role('credential').optional(),
  enableMediaUpload: Schema.boolean().default(true),
  dmPolicy: Schema.union([
    Schema.literal('open'),
    Schema.literal('pairing'),
    Schema.literal('allowlist'),
  ]).default('open'),
  allowFrom: Schema.array(Schema.union([Schema.string(), Schema.number()])).optional(),
  groupPolicy: Schema.union([
    Schema.literal('open'),
    Schema.literal('allowlist'),
    Schema.literal('disabled'),
  ]).default('open'),
  groups: Schema.dict(Schema.object({
    requireMention: Schema.boolean().default(true),
    enabled: Schema.boolean().default(true),
    allowFrom: Schema.array(Schema.union([Schema.string(), Schema.number()])).optional(),
    groupSessionScope: Schema.union([
      Schema.literal('group'),
      Schema.literal('group_sender'),
    ]).default('group'),
  })).optional(),
  historyLimit: Schema.integer().min(0).optional(),
  textChunkLimit: Schema.integer().positive().optional(),
  mediaMaxMb: Schema.number().positive().default(20),
  routes: Schema.array(Schema.object({
    conversationId: Schema.string(),
    agentScope: Schema.string().default('main'),
  })).optional(),
  // —— 桥接专属 ——
  inboxWakeup: Schema.union([
    Schema.literal('followup'),
    Schema.literal('steer'),
  ]).default('followup'),
  streamTimeoutMs: Schema.number().positive().default(60000),
})

export function registerSettings(ctx) {
  ctx.settings.register('channel-dingtalk', ChannelDingtalkSettings)
}
```

### 3.5 凭证注册

```ts
// 在 apply() 里
ctx.credentials?.register({
  namespace: 'channel-dingtalk',
  entries: [
    { id: 'clientId', envVar: 'DINGTALK_CLIENT_ID' },
    { id: 'clientSecret', envVar: 'DINGTALK_CLIENT_SECRET' },
  ],
})
```

---

## 4. cordis.yml 装配

### 4.1 主机 composition（`base.cordis.yml`）需要新增的行

```yaml
# 在 settings / credentials / tools / agents / jobs 等相关 service 之后

- id: dingtalk-stream-bridge
  name: '@local/dsh-channel-dingtalk'
  config:
    enabled: true
    defaultAccount: 'default'
    # credentials 通过 ctx.credentials.seam 读取环境变量，不在这里写值
    dmPolicy: 'allowlist'
    groupPolicy: 'allowlist'
    groups:
      'cXXXXXX1':    # 群 1
        requireMention: true
        groupSessionScope: 'group'
      'cXXXXXX2':    # 群 2
        requireMention: true
        groupSessionScope: 'group_sender'
    routes:
      - conversationId: 'cXXXXXX1'
        agentScope: 'main'
    inboxWakeup: 'followup'
```

### 4.2 Agent preset（`agent.cordis.yml`）需要新增的行

channel bridge 自动在 `setup()` 里给目标 agent 安装钉钉专用 tool；preset 里**不需要重复声明**钉钉工具（避免污染其他 agent）。

如果某些 preset 想给所有 agent（不只钉钉触发的）也开放钉钉工具，加这一段：

```yaml
- id: dingtalk-tools
  name: '@local/dsh-channel-dingtalk/tools-only'
  config: {}
```

`tools-only` 是同一个包的另一个入口，只注册 tools 不启动 stream——解耦后给 preset 用。

---

## 5. 工程实现步骤（按 8 周估）

| 阶段 | 时间 | 产出 |
|---|---|---|
| **W1** 复制 connector 业务代码 + 剥离 OpenClaw 依赖 | 3 天 | `apis/`（7 个 OpenAPI 客户端）、`auth.ts`、`runtime/stream.ts` 雏形 |
| **W1** zod schema 翻译为 schemastery | 1 天 | `settings-schema.ts` |
| **W2** `apply(ctx)` 主骨架 + settings/credentials/effect | 2 天 | `apply.ts` |
| **W2** 7 个 DSH tool 的封装 | 3 天 | `tools/dingtalk_*.ts` |
| **W3** AI Card 流式响应适配 | 5 天 | `runtime/ai-card.ts` |
| **W3** 流式 → session/event 订阅 → 钉钉 AI Card 渲染 | 5 天（与上并行） | `runtime/stream.ts` 完整实现 |
| **W4** 会话路由：钉钉 conversationId → DSH sessionId → handle 缓存 | 3 天 | `runtime/session-routing.ts` |
| **W4** 群/私聊策略（dmPolicy/groupPolicy/requireMention/allowlist） | 3 天 | `runtime/policy.ts` |
| **W5** 设置 UI（typert）+ README | 2 天 | `typert/`、`README.md` |
| **W5** 端到端测试（用钉钉沙箱 + 模拟 stream 事件） | 3 天 | `tests/` |
| **W6-W7** 稳定性打磨、错误恢复、断线重连 | 5 天 | `runtime/reconnect.ts` |
| **W8** 文档、示例 preset、上线检查清单 | 3 天 | `docs/` |

总计 ~35 个工作日 = **约 7 周**。

---

## 6. 风险与决策点

### 6.1 已知风险

| 风险 | 缓解 |
|---|---|
| 钉钉 stream 断线 | `dingtalk-stream` 自带心跳 + 自动重连；保留 connector 的 `DINGTALK_STRICT_DUPLICATE_LOAD` 检测 |
| AI Card 创建频率限制（钉钉端） | 单 conversationId 复用同一张 card，复用上限 24h，过期重建 |
| 长会话 token 爆炸 | 接入 `dsh-compaction-basic`（已在 standard preset 内），自动压缩 |
| 钉钉 @mention 群策略歧义 | 复用 connector 的 `groups.<conversationId>.requireMention` 配置 |
| OpenClaw 的 `gateway-methods.ts`（27k）丢弃后的功能缺口 | 这些是 OpenClaw 特有的运维接口（chat history 查询、reset 等），DSH 端用 `ctx.sessionQuery` + `ctx.sessionProjection` 替代 |

### 6.2 安全默认

复用 connector 的安全策略：
- **私聊默认 `pairing`**：首次私聊会发送配对码，用户确认后才接受
- **群聊默认 `open` + `requireMention: true`**：必须 @机器人才响应
- **`tools.deny` 默认 `["dingtalk_ding", "dingtalk_log_submit"]`**：高危操作默认关闭
- **OAuth 凭证只引用，不存值**（`ctx.credentials` seam + schemastery `secret().role('credential')`）

### 6.3 MVP 范围（首期建议）

- ✅ 钉钉消息收发（文本/Markdown + AI Card 流式）
- ✅ 单账号、单群、单 agent
- ✅ 私聊 `pairing` 模式
- ❌ 文档/表格/日历/待办/日志（后期按需）
- ❌ 多账号、多 agent 路由
- ❌ 富媒体上传（图片/音频）

---

## 7. 验证清单（实施完成时跑这一遍）

- [ ] `dsh plugin validate` 能识别 `@local/dsh-channel-dingtalk`
- [ ] `ctx.settings.describe('channel-dingtalk')` 返回 schemastery schema
- [ ] `ctx.credentials.describe()` 显示 clientId / clientSecret 两行
- [ ] 在 `~/.dsh/settings.yaml` 填入 `channel-dingtalk:` 配置能 merge over base
- [ ] `dsh-cordis-mount` 临时挂载后 `cordis_inspect what:"services"` 能看到 stream bridge 已注册
- [ ] 钉钉群 @机器人 → 钉钉收到 AI Card 流式回复
- [ ] 同一群第二次 @机器人 → 复用同一 session，能记住上文
- [ ] 关闭 DSH 进程再启动 → 自动 `resumeSessionId` 加载历史
- [ ] 私聊陌生人 → 收到配对码提示
- [ ] 群里不 @机器人 → 不响应
- [ ] 拔网线 30s → 自动重连，消息不丢
- [ ] `dsh-cordis-unmount` 后 stream 干净关闭（无僵尸进程）

---

## 8. 替代方案回顾

| 方案 | 工作量 | 长期价值 | 推荐度 |
|---|---|---|---|
| **A. 重写为 DSH 插件（本文方案）** | ~7 周 | 高（独立维护、可平滑升级） | ⭐⭐⭐⭐⭐ |
| B. 本地 fork + OpenClaw stub | ~4 周 | 低（私货 fork、需维护 stub） | ⭐⭐⭐ |
| C. 完全绕开 connector 重写 | ~10 周 | 最高 | ⭐⭐⭐ |
| D. connector + DSH CLI 桥接（OpenClaw 调 dsh） | 1 周 | 低（流式体验丢失） | ⭐⭐ |

---

## 9. 立即可做的下一步

如果你同意上面这个方案，可以这样推进：

1. **W1 第一天**：克隆仓库 + 启动子分支
   ```bash
   git clone https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector.git \
     /Users/chenming/Documents/Default\ Project/dingtalk-dsh-integration/upstream
   cd /Users/chenming/Documents/Default\ Project/dingtalk-dsh-integration/upstream
   git checkout -b dsh-port
   ```

2. **W1 第一天**：建立 DSH 端骨架包
   ```bash
   mkdir /Users/chenming/Documents/Default\ Project/dingtalk-dsh-integration/dsh-channel-dingtalk
   cd /Users/chenming/Documents/Default\ Project/dingtalk-dsh-integration/dsh-channel-dingtalk
   pnpm init
   ```

3. **W1 第二天**：开始从 `upstream/src/services/messaging/index.ts` 复制 + 改写 `apis/messaging.ts`

需要我现在就动手开第一步（克隆仓库 + 建骨架包 + 复制 messaging 模块），就告诉我一声。