# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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