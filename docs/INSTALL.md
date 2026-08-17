# 安装指南

## 方式一：通过 cordis.patch.yml 加载（推荐）

这是 DSH 的标准插件加载方式。不需要 `npm install -g`，不需要修改任何 DSH 系统文件。

### 第 1 步：克隆并编译插件

```bash
# 克隆仓库
git clone git@github.com:ChanMing-prog/DSH-DingTalk-Channel-Plugin.git \
  ~/DSH-DingTalk-Channel-Plugin

cd ~/DSH-DingTalk-Channel-Plugin
pnpm install && pnpm build
```

编译完成后，插件入口在 `~/DSH-DingTalk-Channel-Plugin/dist/apply.js`。

### 第 2 步：配置凭证

在 `~/.dsh/settings.yaml` 里加上钉钉凭证（或者用环境变量，见下方）：

```yaml
# ~/.dsh/settings.yaml（追加）
channel-dingtalk:
  clientId: 'dingxxxxxxxxxxxxxxxx'
  clientSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

或者用环境变量（推荐放在 `~/.zshrc` / `~/.bashrc` 里）：

```bash
export DINGTALK_CLIENT_ID='dingxxxxxxxxxxxxxxxx'
export DINGTALK_CLIENT_SECRET='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

### 第 3 步：编辑 cordis.patch.yml，插入插件

编辑你使用的 profile 的 patch 文件（web profile 用的是 `~/.dsh/profiles/web/cordis.patch.yml`）：

```bash
# 打开编辑（用你熟悉的编辑器）
vim ~/.dsh/profiles/web/cordis.patch.yml
```

在文件里加一个 `- insert:` 条目，指向插件的绝对路径：

```yaml
# DSH DingTalk Channel Plugin
# 把钉钉消息桥接到 DSH agent，支持 AI Card 流式回复。
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
        # 凭证通过 settings.yaml 或环境变量读取，不在这里写明文
```

**注意**：`name` 必须是插件目录的**绝对路径**（本仓库不是 npm registry 上的包）。

保存后，重启 DSH Web：

```bash
dsh web
```

DSH 启动时会：
1. 加载 `dsh-base` bundle（包含工具、session、llm 等基础服务）
2. 加载 `dsh-web-app` bundle（Web UI）
3. 应用 `cordis.patch.yml` 里的 insert 条目 → 触发 `dist/apply.js` 的 `apply(ctx)`
4. 插件启动 stream bridge、注册 tools、注册 settings namespace

### 第 4 步：验证

浏览器打开 DSH Web → **设置 → 插件 → DingTalk Channel**：

- 顶部 banner 应显示 ✅ 配置正确
- 9 个分块配置应正确渲染
- 点击"多账号"区域的"新增账号"应能正常添加

### 第 5 步：端到端验证

在钉钉里找到你创建的机器人，私聊发一条消息：

```
你好
```

钉钉应收到 AI Card 流式回复（打字机效果）。

---

## 方式二：直接用 `dsh` CLI 加载（开发者快速验证）

如果只是想快速验证插件是否能跑，不需要编辑 `cordis.patch.yml`：

```bash
# 用 --patch 参数临时注入（只对本次启动生效）
dsh web --patch /Users/chenming/DSH-DingTalk-Channel-Plugin/cordis.yml
```

`--patch` 是 DSH 的命令行参数，格式是一个路径，指向一个包含 patch entries 的 YAML 文件。本仓库的 `cordis.yml` 就是这个格式。

---

## 方式三：在 agent preset 里加载（只对特定 preset 生效）

如果你想只在某个 agent preset（如 `standard`）里启用钉钉工具，可以在那个 preset 的 `agent.cordis.yml` 里加一行：

```yaml
# ~/.dsh/.agent-presets/my-custom-preset/agent.cordis.yml
# （先 dsh preset copy standard my-custom-preset，然后编辑）

# 在已有行之后追加：
- id: dingtalk-tools
  name: '/Users/chenming/DSH-DingTalk-Channel-Plugin/dist/tools/index.js'
  config: {}
```

这只加载工具（`dingtalk_send` 等），不启动 stream bridge。适合"只想在 agent 里用钉钉工具，不想开全功能 bridge"的场景。

---

## 配置参考

### 单账号（最简）

```yaml
# ~/.dsh/settings.yaml
channel-dingtalk:
  clientId: 'dingxxxxxxxxxxxxxxxx'
  clientSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

### 多账号 + 多 Agent

```yaml
channel-dingtalk:
  defaultAccount: 'prod-bot'
  accounts:
    prod-bot:
      name: '生产机器人'
      clientId: ${env:DINGTALK_PROD_BOT_CLIENT_ID}
      clientSecret: ${env:DINGTALK_PROD_BOT_CLIENT_SECRET}
      dmPolicy: 'allowlist'
      allowFrom: ['staffA', 'staffB']
      routes:
        - conversationId: 'cProdGroup1'
          agentScope: 'prod-agent'

    dev-bot:
      name: '开发机器人'
      clientId: ${env:DINGTALK_DEV_BOT_CLIENT_ID}
      clientSecret: ${env:DINGTALK_DEV_BOT_CLIENT_SECRET}
      groups:
        'cDevGroup1':
          groupSessionScope: 'group_sender'

  bindings:
    - agentId: 'prod-agent'
      match: { channel: 'dingtalk-connector', accountId: 'prod-bot' }
    - agentId: 'dev-agent'
      match: { channel: 'dingtalk-connector', accountId: 'dev-bot' }
```

---

## 常见问题

### Q: DSH 启动时报 "Cannot find package 'openclaw'"
**A**：这是插件代码没编译。确认运行了 `pnpm build`，且 `dist/apply.js` 存在。

### Q: Web 设置面板显示 "Not configured"
**A**：凭证没配。在 `~/.dsh/settings.yaml` 的 `channel-dingtalk:` 下填 `clientId` / `clientSecret`，或设置 `DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET` 环境变量。

### Q: 群里发消息不响应
**A**：检查：
1. `requireMention: true` 时，必须 @机器人
2. `groupPolicy: 'allowlist'` 时，白名单为空会拒绝所有消息
3. 确认钉钉开放平台已给应用开启"机器人"能力

### Q: AI Card 显示"正在思考"但没有文字
**A**：AI Card 流式需要 DSH agent 连接到可用的 LLM provider。确认 `~/.dsh/settings.yaml` 里的 LLM 配置正确（`llm-pi-ai:` / `agent-default-model:` 等）。

### Q: 多账号模式只启动了一个 stream 连接
**A**：检查 `accounts` 字典里每个账号是否都有 `enabled: true`，以及各自的凭证是否正确。DSH 启动日志会打印每个账号的 stream 状态。

### Q: Token 过期导致发送失败
**A**：插件内置了 token 主动续期（每 50min 刷新一次，2h 有效期）。如果 token 过期，检查 `DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET` 是否正确。
