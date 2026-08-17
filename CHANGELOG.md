# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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