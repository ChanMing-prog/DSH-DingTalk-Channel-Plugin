# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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