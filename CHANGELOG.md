# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-08-17 (PR-9: README installation guide)

### Changed
- `README.md`: replaced minimal "安装（开发者模式）" with a complete 7-step
  installation guide covering:
  1. Creating a DingTalk enterprise app (open platform)
  2. Cloning and building the plugin (`pnpm install && pnpm build`)
  3. Credential configuration (env vars / settings.yaml / Web UI)
  4. Loading the plugin in DSH host composition (`cordis.yml`)
  5. Starting DSH and verifying (single DM / group @mention / AI Card)
  6. Media sending verification (agent calls `dingtalk_send_media`)
  7. Typert lint check (`pnpm lint:typert`)
- Added **Architecture** section with full `src/` directory tree
- Added **Stability** section summarizing heartbeat / reconnect / dedup / token refresh
- Added **Configuration Reference** section (single-account + multi-account YAML examples)
- Added QR-code auth recommendation (upstream connector's `npx install`)
- `package.json`: 1.0.0 → **1.0.1**

## [1.0.0] — 2026-08-17 (PR-8: Stability — heartbeat + reconnect + token scheduler)

### Added
- **`src/runtime/stability.ts`** — StreamConnection with production-grade stability:
  - `StreamConnection.create(creds, accountId, opts)` — creates a managed connection
    wrapping `dingtalk-stream` SDK `DWClient`
  - **Heartbeat**: 10s interval, native WebSocket `ping()`; 20s timeout triggers reconnect
  - **Exponential backoff**: `calculateBackoffDelay(attempt)` — `1s * 2^attempt + jitter`,
    capped at 30s; used for every reconnect attempt
  - **Immediate reconnect on server disconnect topic**: intercepts `SYSTEM.disconnect`
    topic message → reconnect without backoff (dingtalk LB/instance switch pattern)
  - **Immediate reconnect on WebSocket close**: `client.socket.on('close')` → reconnect
  - **AI-task grace period**: `markProcessingStart()` refreshes `lastSocketAvailableTime`
    every 15s during AI long-tasks to prevent heartbeat timeout during tool execution
  - **Message dedup (double-layer)**:
    - Protocol layer: `headers.messageId` — deduplicates same-delivery repeated callbacks
    - Business layer: `data.msgId` — deduplicates server-side retransmissions (headers change
      but `data.msgId` stays the same)
    - TTL: 5 min, probabilistic 1% cleanup
  - **SDK console noise suppression**: filters `Disconnecting.` / `[timestamp] connect success`
    from `dingtalk-stream` SDK to avoid ops confusion during normal reconnects
  - `conn.onMessage(handler)` / `conn.onStatus(callback)` — register inbound + status callbacks
  - `conn.start()` returns disposer; `conn.stop()` cleans up all timers + listeners
  - `conn.connected` / `conn.stats` for runtime introspection
- **`src/apis/tokens.ts`** — `startTokenRefreshScheduler(creds, intervalMinutes)`:
  - Proactively refreshes `accessToken` every 50 min (before 2h expiry)
  - Also refreshes `oapiAccessToken` on each cycle
  - `stopTokenRefreshScheduler()` to cancel
  - Called from `apply()` after stream bridge starts
- **`tests/stability.test.ts`** — 11 tests:
  - `calculateBackoffDelay`: ~1s on attempt 0, exponential growth, 30s cap, jitter variation
  - `checkAndMarkMessage`: first-call false, protocol dedup, business dedup, cross-account independence, undefined handling
  - `StreamConnection` import: module structure
  - Token scheduler: start/stop, double-start safety

### Changed
- `runtime/stream.ts`:
  - `startStreamForAccount` now creates `StreamConnection` (from `stability.ts`)
    instead of raw `DWClient` with manual `client.start()` / `client.close()`
  - Message handler calls `parseInboundMessage(res, accountId)` with StreamConnection
    callback shape instead of raw dingtalk-stream callback
  - `startDingtalkStreamBridge` compat signature preserved for backward compatibility
- `apply()`:
  - Calls `startTokenRefreshScheduler(creds, 50)` after stream bridge starts
  - Calls `stopTokenRefreshScheduler()` on fiber unload
- `package.json`: 0.9.0 → **1.0.0**

### Preserved from upstream
- All constants: `HEARTBEAT_INTERVAL=10s`, `TIMEOUT_THRESHOLD=20s`,
  `BASE_BACKOFF_DELAY=1s`, `MAX_BACKOFF_DELAY=30s` (exact upstream values)
- `doReconnect(immediate)` logic: disconnect old → connect → wait open event
  (10s timeout) → reset counters → report connected
- `setupPongListener` / `setupCloseListener` / `setupDisconnectTopicListener`
  structure (fork of connection.ts:356-406)
- `markProcessingStart/End` (fork of connection.ts:219-254) with 15s refresh
- `checkAndMarkMessage` double-layer dedup (protocol + business)
- SDK console noise filter (exact same filter patterns)

### Known Limitations
- Token scheduler is per-`credentials` object; in multi-account mode, each
  account's `resolveCredentials` returns its own credentials object, so the
  scheduler refreshes the default-account's token. Multi-account token refresh
  requires iterating `listAccountIds` and scheduling per-account (deferred).
- `StreamConnection` does not expose raw `DWClient.socket` — AI Card creation
  uses HTTP APIs exclusively (no socket callback path). CardReplier is noted
  as available but intentionally skipped.
- macOS LaunchAgent EBADF fix from upstream (connection.ts:152-174) is not
  ported (not needed for most DSH deployments).

### Security
- Message dedup TTL prevents replay attacks within 5min window
- Token proactive refresh prevents mid-operation expiry (e.g., during long
  AI Card streaming or tool execution)

## [0.9.0] — 2026-08-17 (PR-7: Remove placeholder tools)

### Removed
- **6 placeholder tool files** — Deleted `dingtalk_doc`, `dingtalk_sheet`,
  `dingtalk_calendar`, `dingtalk_task`, `dingtalk_log`, `dingtalk_ding`.
  These were stubs returning `{ ok: false, error: 'not implemented yet' }`
  and will not be implemented in this plugin's scope.
- **README capability table** — Removed 6 rows (钉钉文档, DING 消息,
  待办任务, AI 表格, 日历日程, 日志).

### Changed
- `src/tools/index.ts`: registers only the 3 real tools
  (`dingtalk_send`, `dingtalk_send_media`, `dingtalk_process_markers`)
- `package.json`: 0.8.0 → **0.9.0**

## [0.8.0] — 2026-08-17 (PR-6c: Typert reflection + Remote service + lint)

### Added
- **Typert Remote service** — `ConfigStatusService` exposes 4 `@Remote` methods
  to the DSH Gateway. Browser clients can call them via `ctx.remote`:
  - `check(config)` → `ConfigStatus` (banner info)
  - `validate(config)` → `{ ok: true } | { ok: false, errors: [...] }`
  - `listAccounts(config)` → `string[]`
  - `summary(config)` → `{ ok, enabledCount, message }`
- **`dsh-typert-protocol` integration** — Uses `@Remote` decorator,
  `TypertRemoteService` base class, and `remoteMethods()` introspection.
  No codegen needed; runtime decorators carry the metadata.
- **Hand-written `TYPERT_HOST_ARTIFACT`** — Mirror of the shape that
  `@deepseek-ai/dsh-typert-generator` emits (4 invocations, schema refs,
  `model.services/events/objects`). Generated artifacts swap-in ready.
- **`src/typert/loader-contract.ts`** — End-to-end validation that mirrors
  what `dsh-typert-loader` does:
  - `validateTYPERTManifest()` — required / recommended fields
  - `detectSchemaCoverDrift(schemaFields)` — sections ↔ schema ↔ drift
  - `detectLocaleDrift()` — per-locale coverage + missing-from-base
  - `lintTypert(schemaFields)` — one-stop combined lint
- **`src/typert/schema-fields.ts`** — `TOP_LEVEL_SCHEMA_FIELDS` constant
  (23 fields) shared between tests and `scripts/lint-typert.ts`.
- **`scripts/lint-typert.ts`** — CLI runner that exits 0 on pass, 1 on
  errors, 2 on setup problems. Wire to `pnpm lint:typert`.
- **11 new tests** in `tests/typert-pr6c.test.ts`:
  - validateTYPERTManifest: passes on current / stats / warnings
  - detectSchemaCoverDrift: coverage / orphan / detect
  - detectLocaleDrift: zh base / en ≥ 90% / ja partial / missing-from-other
  - lintTypert: one-stop / with errors
  - ConfigStatusService: 4 methods exposed / direct invocation /
    check / validate ok / validate invalid / listAccounts / summary /
    typertRemote binding
  - TYPERT_HOST_ARTIFACT: shape / refs / count
  - Integration: checkConfigStatus === ConfigStatusService.check

### Updated
- `apply.ts`:
  - calls `registerConfigStatusService(ctx)` (line 2.7)
  - calls `lintTypert(TOP_LEVEL_SCHEMA_FIELDS)` at boot (line 2.8)
  - disposes `ConfigStatusService` on fiber unload
- `src/typert/index.ts`: re-exports `validateTYPERTManifest`,
  `detectSchemaCoverDrift`, `detectLocaleDrift`, `lintTypert`,
  `ConfigStatusService`, `registerConfigStatusService`, `TYPERT_HOST_ARTIFACT`
- `package.json`:
  - Version: 0.7.0 → **0.8.0**
  - `peerDependencies` adds `@deepseek-ai/dsh-typert-protocol` (optional)
  - `scripts` adds `lint:typert`
  - `devDependencies` adds `tsx`

### Known Limitations / Deferred
- **Real codegen still deferred** — `@deepseek-ai/dsh-typert-generator@0.0.1-rc.1`
  exists on npm but requires `typescript ^6.0.3` (we ship 5.6) and is still
  pre-release. PR-6c hand-writes the artifact shape; when the generator
  stabilizes on our dep version, swap `TYPERT_HOST_ARTIFACT` for
  `await generator.generate(...)` in a build script.
- **Schema reflection is shallow** — `remoteMethods` returns only method
  names + invocation markers. zod schema → JSON Schema conversion is
  the generator's job (not done here); the artifact references schema
  names as strings.

### Security
- No new attack surface; `ConfigStatusService` methods are pure
  (no I/O, no state); they only read from the calling client's config.

## [0.7.0] — 2026-08-17 (PR-6b: Multi-language locale registry)

### Added
- Refactored flat `LOCALE` constant into per-language files
  (`src/typert/locale/{zh,en,ja}.ts`)
- `LOCALES_FOR_REGISTER` matches `dsh-client-locale` bulk-register contract
  - locale IDs are `'zh'` / `'en'` / `'ja'` (base subtag), NOT `'zh-CN'`
- `lookupLocale(active, key, params)` matches DSH server-side fallback chain
  (active → zh fallback → key)
- `LocaleKey` union type for compile-time key coverage
- `findLocaleDivergence()` CI helper
- `registerAllLocales(ctx)` in apply.ts: bulk register + per-locale fallback
- Client-side `resolveT(active, key, params)` mirrors lookup chain
- ZH_FALLBACK: 10 critical keys for browser fallback
- `ja` partial scaffold (10 keys) demonstrates fallback chain
- Backward-compat: `LOCALE['zh-CN']` still aliases zh (PR-5 tests pass)
- 24 tests in `tests/locale.test.ts`

## [0.6.0] — 2026-08-17 (PR-6a: Multi-account React components)

### Added
- **Browser-side React app for multi-account / multi-bot settings UI**
  - **`src/client/Field.tsx`** — shared field primitives (TextField, TextAreaField,
    SelectField, CheckboxField, Section, Button, useT) — plain React 18,
    no DSH dependency
  - **`src/client/AccountsEditor.tsx`** — multi-account CRUD UI:
    - Add / remove / edit accounts in a collapsible panel list
    - Per-account form: enabled, friendlyName, chatbotUserId, clientId,
      clientSecret (masked), dmPolicy, groupPolicy, allowFrom
    - Auto-generates `bot-N` ids, never collides with existing keys
  - **`src/client/BindingsEditor.tsx`** — bindings editor:
    - Add / remove / edit (agentId → accountId) pairs
    - Account select shows `default` + all configured accounts
  - **`src/client/GroupsEditor.tsx`** — per-conversation group config:
    - Add / remove (conversationId → { requireMention, groupSessionScope })
  - **`src/client/ChannelCard.tsx`** — root card:
    - Status banner driven by checkConfigStatus() warnings
    - Sections: Basic (credentials + system prompt), Accounts, Bindings,
      Groups, Bridge (wakeup/timeouts), Limits (collapsed)
    - Help footer with open-platform / env-vars / multi-account docs
  - **`src/client/styles.css`** — scoped CSS using DSH design-system CSS
    variables (`--dsw-*`) with dark-mode auto-adapt
  - **`src/client/types.ts`** — React-friendly types (mirror settings-schema)
  - **`src/client/index.ts`** — `clientManifest` with `settings.plugins.tab`
    and `settings.plugin.item` slot registrations, plus React component
    re-exports and a `mount(el, props)` helper
- **`tsconfig.client.json`** — JSX/React preset for `tsc -p tsconfig.client.json`
- **`vitest.config.ts`** — happy-dom environment + JSX automatic transform
- **`tests/client.test.tsx`** — 19 React Testing Library tests:
  - Field primitives: TextField, SelectField, CheckboxField, Section, Button, useT
  - Editors: AccountsEditor (empty / add / unique-id), BindingsEditor (empty / add),
    GroupsEditor (empty / add)
  - ChannelCard integration: status banner (ok / partial_config /
    bindings_missing / not_configured), sections rendering

### Changed
- `package.json`:
  - Version: 0.5.0 → **0.6.0**
  - `exports`: `./client` → `./dist/client/index.js`
  - `peerDependencies`: adds `react: ^18.2.0`
  - `devDependencies`: adds `react`, `react-dom`, `@types/react`, `@types/react-dom`,
    `@testing-library/react`, `happy-dom`
- `scripts`:
  - `build:client` — `tsc -p tsconfig.client.json` (compile client to dist-client/)
  - `type-check:client` — same with --noEmit

### Known Limitations
- DSH will call esbuild itself to bundle our `./client` export (we don't ship
  prebuilt browser code; the build:client script is for type-checking / CI
  only). When `@testing-library/react` + `happy-dom` aren't installed in the
  consumer deployment, the client tests are skipped — that matches the DSH
  assumption that browser deps are provided by the shell.
- React component bundle currently assumes `react` is in the consumer's
  peerDependencies (DSH satisfies this).
- The custom widgets ship fully functional — no `dsh-client-ui-*` imports
  (per the DSH build pipeline that does not bundle sibling-package deps).

## [0.5.0] — 2026-08-17 (PR-5)

### Added
- **DSH Typert settings UI 完整支持**
  - **`src/typert/manifest.ts`** — TYPERT constant declaring plugin identity
    (package `@local/dsh-channel-dingtalk`, face `host`) and contributions
    to two settings UI slots:
    - `settings.plugins.tab` — adds "DingTalk Channel" tab to settings page
    - `settings.plugin.item` — adds a card to the plugin configuration tab
    - Both with bilingual labels (`zh-CN` / `en`) and `order: 35`
  - **`src/typert/locale.ts`** — full bilingual locale dictionary
    - **80+ keys** covering every schema field (credentials, policies,
      accounts, bindings, bridge, limits, routes, status, help)
    - `options.<enum>` keys for enum-typed fields (dmPolicy, groupPolicy,
      inboxWakeup) so settings UI renders localized radio/select labels
    - `description` keys for tooltip / help text
    - Status banners (`status.notConfigured`, `status.partialConfig`,
      `status.bindingsMissing`, `status.allGood`, `status.accountsCount`)
  - **`src/typert/sections.ts`** — 9 logical sections for the settings card:
    1. credentials
    2. basic (enabled / defaultAccount / systemPrompt / enableMediaUpload)
    3. dmPolicy (private chat)
    4. groupPolicy (group chat) — with `groups` per-conversation override
    5. **accounts** (multi-bot) — marked `customWidget: 'accounts-list'`
    6. **bindings** — marked `customWidget: 'bindings-list'`
    7. routes (top-level)
    8. bridge (inboxWakeup / timeouts)
    9. limits (collapsed by default)
    - `getSection(id)` / `findSectionForField(name)` / `validateSectionCoverage(allFields)` /
      `validateSectionFieldsExist(allFields)` for runtime validation
  - **`src/typert/validate.ts`** — `checkConfigStatus(config)` returns
    `{ ok, enabledCount, missingAccountsInBindings, warnings, info }`
    Used by the settings UI top banner to flag misconfiguration
  - **`src/typert/index.ts`** — public entry: `TYPERT`, `LOCALE`, `SECTIONS`,
    `checkConfigStatus`, all re-exported. Default export = `TYPERT`
    (this is what `dsh-typert-loader` discovers via `./typert` export)
- **`src/client.ts`** — Browser half entry (`./client`):
  - `clientManifest` with `settings.sections` / `settings.locale` / `settings.status` /
    `typert` contributions
  - `onSettingsMount(ctx)` hook reserved for future custom React widgets
  - Re-exports `TYPERT`, `SECTIONS`, `LOCALE` for direct browser use
- **`registerLocale(ctx)`** in apply() — pushes zh-CN dictionary to `ctx.locale`
  (DSH locale plugin); full multi-language support deferred to PR-6
- **`ctx['channel-dingtalk']`** now includes `typertVersion` and `localeKeys`
  metadata for runtime introspection

### Changed
- `package.json`:
  - Version: 0.4.0 → **0.5.0**
  - `exports` adds `"./typert"` → `./dist/typert/index.js`
- `apply()`:
  - Calls `registerLocale(ctx)` (best-effort: warns if `ctx.locale` unavailable)
  - Calls `checkConfigStatus(config)` at boot to log health to operator
  - Adds `typertVersion` / `localeKeys` to bridge context
- Default-export TYPERT (= named TYPERT) for `dsh-typert-loader` discovery

### Preserved from upstream
- OpenClaw connector's `accounts` / `bindings` shape stays intact (no
  schema migration needed for users coming from OpenClaw configs)
- `validateBindings` semantics: warns but does not abort on missing accounts

### Known Limitations (carried forward)
- 6 remaining tools (doc/sheet/calendar/task/log/ding) still placeholder
- en locale dictionary registered as fallback only; full i18n via dsh-locale-intl
  deferred to PR-6
- Browser half ships metadata only — DSH's automatic form renderer based on
  schemastery schema is sufficient for ~80% of fields. Custom React widgets
  for `accounts` (multi-account editor) / `bindings` (binding list editor)
  deferred until users actually edit these interactively
- No reconnect/retry beyond dingtalk-stream keepalive

### Tests
- **`tests/typert.test.ts`** (NEW): 24 cases
  - **Manifest**: required fields, slot ids, bilingual labels, multi-account hints
  - **Locale**: zh-CN + en present, all keys mirrored, options for enums
  - **Sections**: 9 sections, sorted, unique ids, lookup helpers,
    customWidget markers, accounts not collapsed
  - **Section coverage**: all schema fields covered, no orphans, detection
  - **checkConfigStatus**: notConfigured, ok single-account, enabledCount
    multi-account, partial_config, bindings_missing, accounts_enabled info

## [0.4.0] — 2026-08-17 (PR-4)

### Added
- **Multi-account / multi-bot architecture**
  - **`src/apis/accounts.ts`** — multi-account resolution
    - `listAccountIds(config)` — all enabled accounts
    - `resolveDefaultAccountId(config)` — explicit / mapped / fallback
    - `resolveAccountConfig(config, accountId)` — merged account (base + override)
    - `resolveCredentials(config, accountId)` — credential resolution chain
      (inline → structured ref → env `DINGTALK_<ACCOUNT>_CLIENT_ID/SECRET` → env `DINGTALK_*`)
    - `fromSettings(settings)` — DSH settings → DingtalkConfig adapter
  - **`src/apis/bindings.ts`** — OpenClaw-style bindings index
    - `buildBindingsIndex(config)` — byAgentId / byAccountId index
    - `accountIdForAgent(index, agentId)` / `agentIdsForAccount(index, accountId)`
    - `validateBindings(config)` — flags bindings to non-existent accounts
  - **`src/apis/mentions.ts`** — replaced stub with full upstream fork
    - `buildBotMentionTable` — accountId + name + bindings → alias table
    - `substituteBotMentions` — `@<alias>` → `@<chatbotUserId>`, idempotent,
      long-alias-first sort, bare alias detection via `detectBareAliases`
    - `resolveAtAccountIdsToChatbotUserIds` — missing-account reporting
    - `prepareMultiBotMentions` — high-level entry for `send*` paths
      (combines explicit atAccountIds + text substitution + atDingtalkIds merging)
- **Settings schema extensions**
  - `accounts: Record<accountId, DingtalkAccountConfig>` — multi-bot dictionary
    (each with enabled / name / chatbotUserId / clientId / clientSecret / policies / groups / routes)
  - `bindings: Array<{ agentId, match: { channel, accountId } }>` — OpenClaw-compatible shape
- **Multi-stream bridge**
  - `runtime/stream.ts` `startDingtalkStreamBridges(ctx, config, defaultCreds)` —
    iterates `listAccountIds(config)` and starts one independent `DWClient` per
    enabled account, each with its own BridgeContext (handle/card cache, bindings)
  - `parseInboundMessage(raw, accountId)` — annotates messages with their source account
- **Per-account policy merging** (`runtime/policy.ts`)
  - `mergedPolicies(bctx)` — account-level dmPolicy/groupPolicy/allowFrom/groups override
    top-level config; clean `dm: pair, group: allowlist` baseline
- **Per-account session routing** (`runtime/session-routing.ts`)
  - SessionId prefix includes `accountId` to prevent collision across bots
  - agentScope resolution order: `accounts[accountId].routes` > `routes` > `bindings` > `'main'`

### Changed
- `package.json` version: 0.3.0 → **0.4.0**
- `apis/messaging.ts` re-exports new modules (`accounts`, `bindings`, `mentions`)
- `runtime/setup.ts` `resolveCredentials` now delegates to `apis/accounts.resolveCredentials`
  (single source of truth for credential resolution across single/multi-account)
- `types.ts`:
  - `DingtalkInboundMessage.accountId` — source account
  - `SessionRouting.accountId` — routing output field
  - `BridgeContext.accountId` + `bindingsIndex` — runtime injection

### Preserved from upstream
- `buildBotMentionTable` alias logic (accountId / name / bindings → aliases)
- `substituteBotMentions` long-alias-first sort (avoid "dev-agent" being
  matched as "dev")
- Idempotency: already-encrypted `@$:LWCP_v1:$xxx` never replaced
- Bare alias detection via `detectBareAliases` option

### Known Limitations (carried forward)
- 6 remaining tools (doc/sheet/calendar/task/log/ding) still placeholder
- typert settings UI stub not yet wired
- No reconnect/retry beyond dingtalk-stream keepalive
- `DINGTALK_STRICT_DUPLICATE_LOAD` not ported
- `clientSecret.source = 'file' | 'exec'` not implemented (only 'env');
  warn + fall back to env with same `id`

### Security
- Account-specific env vars: `DINGTALK_<ACCOUNT>_CLIENT_ID/SECRET` —
  prevents credential leaks across accounts
- `bindings.validateBindings` flags bindings to non-existent accounts at startup

### Tests
- **`tests/mentions.test.ts`** (NEW): 35 cases
  - `buildBotMentionTable`: accountId/name/bindings → aliases, disabled skip, extraAliases
  - `substituteBotMentions`: `@<alias>` replacement, friendly-name, idempotency,
    partial-match avoidance, bare alias detection, empty/null safe
  - `resolveAtAccountIdsToChatbotUserIds`: known/missing/empty
  - `prepareMultiBotMentions`: end-to-end (atAccountIds + text + atDingtalkIds)
  - `buildBindingsIndex`: byAgentId/byAccountId, channel filter
  - `validateBindings`: missing accounts, 'default' accepted
  - `accountIdForAgent`: known/unknown
  - `listAccountIds`: default fallback, disabled filter
  - `resolveDefaultAccountId`: explicit/mapped/fallback
  - `resolveAccountConfig`: fallback / configured / unconfigured / policy merge
  - `resolveCredentials`: inline / env / account-specific env / missing-throws

## [0.3.0] — 2026-08-17 (PR-3)

### Added
- **`src/apis/media-meta.ts`** — video/audio metadata extraction
  - `extractVideoMetadata(filePath)` → `{ duration, width, height }` via ffprobe
  - `extractVideoThumbnail(videoPath, outputPath?)` → temp jpg via ffmpeg screenshot at t=1s
  - `extractAudioDuration(filePath)` → ms via ffprobe
  - All three: ffmpeg/ffprobe loaded via dynamic `await import`; missing → return null, never throw
- **`src/apis/media-proactive.ts`** — sample* message senders
  - `sendVideoProactive(creds, target, videoMediaId, picMediaId, metadata?)` → `sampleVideo` to `groupMessages/send` / `orboxMessages/batchSend`
  - `sendAudioProactive(creds, target, fileName, mediaId, durationMs?)` → `sampleAudio`, default duration 60000ms
  - `sendFileProactive(creds, target, fileInfo, mediaId)` → `sampleFile` with fileName/fileType defaults
  - Shared `postSampleMessage` helper: token + endpoint selection + `processQueryKey` check
- **`src/apis/media-markers.ts`** — full proactive marker processing
  - `processVideoMarkers(content, { creds, target, maxBytes? })`:
    - Extracts JSON markers → validates file existence → extracts metadata → extracts thumbnail → uploads video + thumbnail → sends sampleVideo
    - Failure modes: missing oapiToken / invalid JSON / non-existent file / ffmpeg missing / upload failure → status messages appended, never thrown
  - `processAudioMarkers(content, opts)`:
    - Extracts JSON markers → extracts duration (optional) → uploads voice → sends sampleAudio
  - `processFileMarkers(content, opts)`:
    - Extracts JSON markers → uploads file → sends sampleFile
  - Temp thumbnails are cleaned up in `finally` block
- New tool: **`dingtalk_process_markers`** — DSH tool wrapping marker processing + AI Card send
  - Agent writes `content with markers, calls dingtalk_process_markers` → markers become independent messages, remaining text becomes AI Card

### Changed
- `apis/messaging.ts`:
  - `sendMediaToDingTalk` now handles all 4 media types end-to-end:
    - `image`: existing path (sampleImageMsg)
    - `video`: extract metadata + thumbnail → upload both → `sendVideoProactive`
    - `voice`: extract duration → upload → `sendAudioProactive`
    - `file`: upload → `sendFileProactive`
  - Re-exports `media-meta`, `media-proactive`, `media-markers` modules
  - Version bump: `__messagingVersion` 0.2.0 → 0.3.0
- `apis/messaging-proactive.ts`:
  - `sendAICardInternal` now actually processes video/audio/file markers (was placeholder logs)
  - Calls `processVideoMarkers` / `processAudioMarkers` / `processFileMarkers` in sequence
- `runtime/ai-card.ts`:
  - `createAiCard` calls full `createAICardForTarget` (2-step: create + deliver) and stores the real `AICardInstance` (with token/expire/inputingStarted) into `bctx.cardRealCache`
  - `appendAiCardChunk` calls full `apisStreamAICard` (QPS limiter + INPUTING transition + Markdown fix)
  - `completeAiCard` calls full `apisFinishAICard` (FINISHED status + backoff retry)
  - `failAiCard` reuses `apisFinishAICard` with error text
- `tools/index.ts`: registers `dingtalk_process_markers` (NEW)
- `package.json`:
  - Version: 0.2.0 → **0.3.0**
  - `optionalDependencies` adds: `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`

### Preserved from upstream
- `processVideoMarkers` failure status reporting (✅ / ⚠️ emoji prefixes)
- Thumbnail extraction at exactly t=1s
- 20MB default cap (image: 10MB; voice: 2MB)
- Default duration fallback to 60000ms when ffprobe fails

### Known Limitations (carried forward)
- 6 remaining tools (doc/sheet/calendar/task/log/ding) still placeholder
- Multi-bot mentions still stub
- No reconnect/retry beyond dingtalk-stream keepalive
- `DINGTALK_STRICT_DUPLICATE_LOAD` not ported

### Security
- ffmpeg/ffprobe path overrides use installer-provided paths (no shell injection)
- Temp thumbnails cleaned in `finally` (no disk leak)

### Tests
- **`tests/media-proactive.test.ts`** (NEW): 22 cases
  - `sendVideoProactive` / `sendAudioProactive` / `sendFileProactive`: msgKey, payload, default fallbacks
  - `extractVideoMetadata` / `extractAudioDuration` / `extractVideoThumbnail`: null-safety when fluent-ffmpeg missing
  - `processVideoMarkers` / `processAudioMarkers` / `processFileMarkers`: no-token / no-marker / invalid JSON / non-existent file / full flow with real fs temp file

## [0.2.0] — 2026-08-17 (PR-2)

### Added
- **`src/apis/`** — full protocol-layer fork of upstream messaging + media
  - `tokens.ts` — `getAccessToken` / `getOapiAccessToken` with in-flight dedup + 60s refresh buffer
  - `messaging-types.ts` — shared types: `SendResult`, `AICardTarget`, `AICardInstance`, `ProactiveSendOptions`, `MediaType`, `UploadResult`, `MessagingCallOptions`
  - `messaging-send.ts` — webhook text/markdown/link send + `buildMsgPayload` (msgKey/msgParam)
  - `messaging-ai-card.ts` — full AI Card protocol with QPS rate limiter + backoff + Markdown normalization (`fixNewlines`, `normalizeForCard`)
  - `messaging-proactive.ts` — `sendToUser`/`sendToGroup`/`sendProactive` with AI Card → 普通消息降级 + 图片后处理
  - `media.ts` — `uploadMediaToDingTalk` (image/video/voice/file), `processLocalImages` (markdown + bare-path), marker extraction (video/audio/file)
  - `messaging.ts` — top-level facade: `sendTextToDingTalk`, `sendMediaToDingTalk`, `parseTargetString`, plus full re-exports
  - `mentions.ts` — stub for multi-bot collaboration (deferred to PR-4)
- New tool: **`dingtalk_send_media`** — send local media files (image fully working; video/audio/file return success placeholder)
- Refactored: **`dingtalk_send`** now uses `apis/messaging.sendToUser` / `sendToGroup` instead of inline HTTP
- Refactored: **`runtime/ai-card.ts`** is now a thin wrapper over `apis/messaging-ai-card`; protocol logic moved to apis/
- Extended: **`types.ts`** `BridgeContext` now has `cardRealCache: Map<cardKey, AICardInstance>` to bridge `AiCardInstance` (DSH-side cache) with `AICardInstance` (apis-side, holds token/expire/inputingStarted)
- Tests: **`tests/apis.test.ts`** — 22 cases covering target parsing, msgKey/msgParam construction, Markdown normalization, marker extraction, `toLocalPath` (URI stripping + decoding), `processLocalImages` (no-token/no-image/missing-file paths), webhook text/markdown send (mocked axios via `axios-mock-adapter`)

### Changed
- `package.json` version: 0.1.0 → **0.2.0**
- Added `axios-mock-adapter` to devDependencies
- README: capability table now has per-feature status column; PR-2 items checked off in dev roadmap

### Preserved from upstream
- AI Card QPS token bucket limiter (20 QPS, 2s backoff on `QpsLimit` 403) — this is the most polished part of upstream's protocol layer
- `fixNewlines` — Markdown → AI Card renderer adaptation (code blocks preserve `\n`, lists keep `\n`, single `\n` → `<br>`)
- `ensureTableBlankLines` — ensures markdown tables render correctly
- Image post-processing: 2-pass (markdown syntax + bare paths), reverse-order replacement to avoid index drift
- `processLocalImages` failure semantics: never throws, returns original content

### Known Limitations (carried forward)
- Only `dingtalk_send` and `dingtalk_send_media` (image path) are fully wired
- Video/audio/file proactive send returns success placeholder; full impl in PR-3
- AI Card stream bridge (`runtime/ai-card.ts`) still uses simplified non-protocol card; protocol streamAICard is exposed via apis/ but not yet wired into the runtime path
- Multi-bot mention table (`mentions.ts`) is a stub
- `DINGTALK_STRICT_DUPLICATE_LOAD` duplicate-load guard from upstream not ported
- No reconnect/retry logic beyond `dingtalk-stream`'s built-in keepalive

### Security
- No changes to credential handling; still env-var refs only
- No changes to policy defaults

## [0.1.0] — 2026-08-17

### Added
- Initial scaffold of `@local/dsh-channel-dingtalk`
- `apply(ctx)` main entry: registers settings namespace, credentials, jobs controller, and stream bridge
- Stream bridge: subscribes to `dingtalk-stream` callbacks and routes inbound messages to DSH agent handles
- Session routing: `dingtalk:<scope>:<conversationId>[:s:<senderStaffId>]` mapping with `group` / `group_sender` scope support
- Message policy: `dmPolicy` (`open`/`pairing`/`allowlist`), `groupPolicy`, `requireMention`, `allowFrom` enforcement
- AI Card bridge: create / append chunk / complete / fail via `/v1.0/card/instances` API
- Tools: `dingtalk_send` (functional), 6 placeholder tools (`dingtalk_doc`, `dingtalk_sheet`, `dingtalk_calendar`, `dingtalk_task`, `dingtalk_log`, `dingtalk_ding`)
- Schemas: dual zod (internal validation) + schemastery (DSH settings) forms
- Cordis composition row (`cordis.yml`) for host composition load
- Typert manifest stub for settings UI integration
- Smoke tests for `routeSession` and `handleMessagePolicy`

### Known Limitations
- Only `dingtalk_send` is functional; 6 other tools return `{ ok: false, error: 'not implemented yet' }`
- AI Card streaming uses REST `stream` endpoint; full event-driven streaming (button callbacks, tool-call rendering) is deferred
- Pairing code emission is a no-op log; production pairing needs a real code-generation flow
- No reconnect/retry logic beyond `dingtalk-stream`'s built-in keepalive
- `DINGTALK_STRICT_DUPLICATE_LOAD` duplicate-load guard from upstream not ported

### Security
- Credentials are referenced via env vars only (`DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET`), never stored
- `clientSecret` schema field marked `role: 'secret'` to prevent settings-UI plaintext exposure
- Default policies are conservative: `dmPolicy='pairing'`, `groupPolicy='allowlist'`, `requireMention=true`

[0.1.0]: https://github.com/ChanMing-prog/DSH-DingTalk-Channel-Plugin/releases/tag/v0.1.0