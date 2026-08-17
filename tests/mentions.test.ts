/**
 * Tests for apis/mentions + apis/bindings + apis/accounts.
 *
 * Covers:
 *   - buildBotMentionTable: accountId + name + bindings → aliases
 *   - substituteBotMentions: @<alias> → @<chatbotUserId>, idempotency, bare alias detection
 *   - resolveAtAccountIdsToChatbotUserIds: missing account reporting
 *   - prepareMultiBotMentions: high-level end-to-end
 *   - buildBindingsIndex: byAgentId / byAccountId
 *   - validateBindings: missing account detection
 *   - resolveCredentials: env-var fallback
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DingtalkConfigSchema } from '../settings-schema.js'
import {
  buildBotMentionTable,
  substituteBotMentions,
  resolveAtAccountIdsToChatbotUserIds,
  prepareMultiBotMentions,
} from '../src/apis/mentions.js'
import { buildBindingsIndex, validateBindings, accountIdForAgent } from '../src/apis/bindings.js'
import { resolveCredentials, resolveAccountConfig, listAccountIds, resolveDefaultAccountId } from '../src/apis/accounts.js'

beforeEach(() => {
  // 清掉所有可能影响测试的 env vars
  delete process.env.DINGTALK_CLIENT_ID
  delete process.env.DINGTALK_CLIENT_SECRET
  delete process.env.DINGTALK_DEV_BOT_CLIENT_ID
  delete process.env.DINGTALK_DEV_BOT_CLIENT_SECRET
})

// =============================================================================
// buildBotMentionTable
// =============================================================================

describe('buildBotMentionTable', () => {
  it('builds aliases from accountId + name + bindings', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'dev-bot': {
          name: '开发助手机器人',
          chatbotUserId: '$:LWCP_v1:$devbot123',
        },
      },
      bindings: [
        { agentId: 'dev-agent', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } },
      ],
    })

    const table = buildBotMentionTable(config)
    expect(table).toHaveLength(1)
    const entry = table[0]
    expect(entry.accountId).toBe('dev-bot')
    expect(entry.name).toBe('开发助手机器人')
    expect(entry.chatbotUserId).toBe('$:LWCP_v1:$devbot123')
    expect(entry.agentIds).toEqual(['dev-agent'])
    expect(entry.aliases).toEqual(expect.arrayContaining(['dev-bot', '开发助手机器人', 'dev-agent']))
  })

  it('skips disabled accounts', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'on': { chatbotUserId: '$:LWCP_v1:$on' },
        'off': { enabled: false, chatbotUserId: '$:LWCP_v1:$off' },
      },
    })
    const table = buildBotMentionTable(config)
    expect(table.map((e) => e.accountId)).toEqual(['on'])
  })

  it('accepts extraAliases option', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'dev-bot': { chatbotUserId: '$:LWCP_v1:$devbot' } },
    })
    const table = buildBotMentionTable(config, {
      extraAliases: { '开发机器人': 'dev-bot' },
    })
    expect(table[0].aliases).toContain('开发机器人')
  })
})

// =============================================================================
// substituteBotMentions
// =============================================================================

describe('substituteBotMentions', () => {
  function config() {
    return DingtalkConfigSchema.parse({
      accounts: {
        'dev-bot': {
          name: '开发助手机器人',
          chatbotUserId: '$:LWCP_v1:$devbot123',
        },
        'pm-bot': {
          chatbotUserId: '$:LWCP_v1:$pmbot456',
        },
      },
    })
  }

  it('replaces @<accountId> with @<chatbotUserId>', () => {
    const result = substituteBotMentions('hi @dev-bot', config())
    expect(result.text).toBe('hi @$:LWCP_v1:$devbot123')
    expect(result.injectedChatbotUserIds).toContain('$:LWCP_v1:$devbot123')
  })

  it('replaces @<friendly-name> with @<chatbotUserId>', () => {
    const result = substituteBotMentions('请问 @开发助手机器人 一下', config())
    expect(result.text).toContain('@$:LWCP_v1:$devbot123')
  })

  it('preserves already-encrypted @$:LWCP_v1:$xxx', () => {
    const text = 'hi @$:LWCP_v1:$devbot123'
    const result = substituteBotMentions(text, config())
    expect(result.text).toBe(text) // 原样保留
    expect(result.injectedChatbotUserIds).toContain('$:LWCP_v1:$devbot123')
  })

  it('does not replace partial matches (longer aliases first)', () => {
    // "dev-bot" 完整匹配时不会被误识别为 "dev"
    const configWithExtra = DingtalkConfigSchema.parse({
      accounts: {
        'dev-bot': { chatbotUserId: '$:LWCP_v1:$devbot' },
      },
    })
    const result = substituteBotMentions('cc @dev-bot', configWithExtra)
    expect(result.text).toBe('cc @$:LWCP_v1:$devbot')
  })

  it('detects bare alias when detectBareAliases=true', () => {
    const result = substituteBotMentions('已拉上 dev-bot review', config(), {
      detectBareAliases: true,
    })
    // 文本不变，但 injectedChatbotUserIds 包含 dev-bot 的 ID
    expect(result.text).toBe('已拉上 dev-bot review')
    expect(result.injectedChatbotUserIds).toContain('$:LWCP_v1:$devbot123')
  })

  it('returns text unchanged when no aliases match', () => {
    const result = substituteBotMentions('no mentions', config())
    expect(result.text).toBe('no mentions')
    expect(result.injectedChatbotUserIds).toEqual([])
  })

  it('returns empty text gracefully', () => {
    const result = substituteBotMentions('', config())
    expect(result.text).toBe('')
    expect(result.injectedChatbotUserIds).toEqual([])
  })
})

// =============================================================================
// resolveAtAccountIdsToChatbotUserIds
// =============================================================================

describe('resolveAtAccountIdsToChatbotUserIds', () => {
  it('resolves known accountIds', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'a': { chatbotUserId: '$:LWCP_v1:$a' },
        'b': { chatbotUserId: '$:LWCP_v1:$b' },
      },
    })
    const result = resolveAtAccountIdsToChatbotUserIds(config, ['a', 'b'])
    expect(result.resolved).toEqual(['$:LWCP_v1:$a', '$:LWCP_v1:$b'])
    expect(result.missing).toEqual([])
  })

  it('reports missing accountIds separately', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'a': { chatbotUserId: '$:LWCP_v1:$a' } },
    })
    const result = resolveAtAccountIdsToChatbotUserIds(config, ['a', 'c'])
    expect(result.resolved).toEqual(['$:LWCP_v1:$a'])
    expect(result.missing).toEqual(['c'])
  })

  it('handles empty / undefined input', () => {
    const config = DingtalkConfigSchema.parse({})
    expect(resolveAtAccountIdsToChatbotUserIds(config, undefined)).toEqual({ resolved: [], missing: [] })
    expect(resolveAtAccountIdsToChatbotUserIds(config, [])).toEqual({ resolved: [], missing: [] })
  })
})

// =============================================================================
// prepareMultiBotMentions (高层 API)
// =============================================================================

describe('prepareMultiBotMentions', () => {
  it('combines explicit atAccountIds + text substitution', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'dev-bot': { chatbotUserId: '$:LWCP_v1:$devbot' },
        'pm-bot': { chatbotUserId: '$:LWCP_v1:$pmbot' },
      },
    })
    const result = prepareMultiBotMentions({
      config,
      content: '问 @pm-bot 一下',
      atAccountIds: ['dev-bot'],
    })
    // 文本里的 @pm-bot 被替换；atAccountIds 的 dev-bot 也被解析并追加
    expect(result.content).toContain('@$:LWCP_v1:$pmbot')
    expect(result.content).toContain('@$:LWCP_v1:$devbot')
    expect(result.atDingtalkIds).toEqual(
      expect.arrayContaining(['$:LWCP_v1:$devbot', '$:LWCP_v1:$pmbot']),
    )
    expect(result.missingAccountIds).toEqual([])
  })

  it('reports missing accountIds', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'a': { chatbotUserId: '$:LWCP_v1:$a' } },
    })
    const result = prepareMultiBotMentions({
      config,
      content: 'plain text',
      atAccountIds: ['a', 'nonexistent'],
    })
    expect(result.missingAccountIds).toEqual(['nonexistent'])
  })
})

// =============================================================================
// bindings
// =============================================================================

describe('buildBindingsIndex', () => {
  it('indexes byAgentId and byAccountId', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'dev-bot': { chatbotUserId: '$:LWCP_v1:$dev' },
        'pm-bot': { chatbotUserId: '$:LWCP_v1:$pm' },
      },
      bindings: [
        { agentId: 'dev-agent', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } },
        { agentId: 'pm-agent', match: { channel: 'dingtalk-connector', accountId: 'pm-bot' } },
        { agentId: 'dev-agent', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } }, // dup
      ],
    })
    const idx = buildBindingsIndex(config)
    expect(idx.byAgentId.get('dev-agent')).toBe('dev-bot')
    expect(idx.byAgentId.get('pm-agent')).toBe('pm-bot')
    expect(idx.byAccountId.get('dev-bot')).toEqual(['dev-agent'])
    expect(idx.byAccountId.get('pm-bot')).toEqual(['pm-agent'])
    expect(idx.bindings).toHaveLength(3) // 不去重
  })

  it('ignores bindings for other channels', () => {
    const config = DingtalkConfigSchema.parse({
      bindings: [
        { agentId: 'a', match: { channel: 'dingtalk-connector', accountId: 'x' } as any },
        { agentId: 'b', match: { channel: 'feishu' as any, accountId: 'y' } },
      ],
    })
    const idx = buildBindingsIndex(config)
    expect(idx.bindings).toHaveLength(1)
  })
})

describe('validateBindings', () => {
  it('flags bindings to non-existent accountId', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'dev-bot': {} },
      bindings: [
        { agentId: 'a', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } },
        { agentId: 'b', match: { channel: 'dingtalk-connector', accountId: 'ghost' } },
      ],
    })
    const result = validateBindings(config)
    expect(result.valid).toHaveLength(1)
    expect(result.missing).toEqual(['ghost'])
  })

  it('accepts "default" as accountId', () => {
    const config = DingtalkConfigSchema.parse({
      bindings: [
        { agentId: 'a', match: { channel: 'dingtalk-connector', accountId: 'default' } },
      ],
    })
    const result = validateBindings(config)
    expect(result.missing).toEqual([])
    expect(result.valid).toHaveLength(1)
  })
})

describe('accountIdForAgent', () => {
  it('returns accountId for known agentId', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'dev-bot': {} },
      bindings: [
        { agentId: 'dev-agent', match: { channel: 'dingtalk-connector', accountId: 'dev-bot' } },
      ],
    })
    expect(accountIdForAgent(buildBindingsIndex(config), 'dev-agent')).toBe('dev-bot')
  })

  it('returns undefined for unknown agentId', () => {
    expect(accountIdForAgent(buildBindingsIndex(DingtalkConfigSchema.parse({})), 'unknown')).toBeUndefined()
  })
})

// =============================================================================
// accounts
// =============================================================================

describe('listAccountIds', () => {
  it('returns ["default"] when no accounts configured', () => {
    expect(listAccountIds(DingtalkConfigSchema.parse({}))).toEqual(['default'])
  })

  it('filters disabled accounts', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'on': { enabled: true },
        'off': { enabled: false },
      },
    })
    expect(listAccountIds(config)).toEqual(['on'])
  })
})

describe('resolveDefaultAccountId', () => {
  it('returns explicit defaultAccount', () => {
    const config = DingtalkConfigSchema.parse({
      defaultAccount: 'prod',
      accounts: {
        prod: {},
        dev: {},
      },
    })
    expect(resolveDefaultAccountId(config)).toEqual({ accountId: 'prod', source: 'explicit-default' })
  })

  it('returns mapped-default when one account configured', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'only': {} },
    })
    expect(resolveDefaultAccountId(config)).toEqual({ accountId: 'only', source: 'mapped-default' })
  })

  it('falls back to "default" when no accounts', () => {
    expect(resolveDefaultAccountId(DingtalkConfigSchema.parse({}))).toEqual({
      accountId: 'default',
      source: 'fallback',
    })
  })
})

describe('resolveAccountConfig', () => {
  it('marks default+no-accounts as fallback', () => {
    const config = DingtalkConfigSchema.parse({
      clientId: 'cid',
      clientSecret: 'csec',
    })
    const acct = resolveAccountConfig(config, 'default')
    expect(acct.selectionSource).toBe('fallback')
    expect(acct.configured).toBe(true)
    expect(acct.clientId).toBe('cid')
  })

  it('marks explicit account as configured when credentials present', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        dev: { clientId: 'cid', clientSecret: 'csec', chatbotUserId: '$:LWCP_v1:$x' },
      },
    })
    const acct = resolveAccountConfig(config, 'dev')
    expect(acct.configured).toBe(true)
    expect(acct.chatbotUserId).toBe('$:LWCP_v1:$x')
  })

  it('marks account as not configured when credentials missing', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { dev: { name: 'dev bot' } },
    })
    const acct = resolveAccountConfig(config, 'dev')
    expect(acct.configured).toBe(false)
  })

  it('merges policies: account overrides base', () => {
    const config = DingtalkConfigSchema.parse({
      dmPolicy: 'open',
      requireMention: false,
      accounts: {
        dev: { dmPolicy: 'allowlist', allowFrom: ['staffA'] },
      },
    })
    const acct = resolveAccountConfig(config, 'dev')
    expect(acct.policies.dmPolicy).toBe('allowlist')
    expect(acct.policies.requireMention).toBe(false) // 继承自 base
    expect(acct.policies.allowFrom).toEqual(['staffA']) // 覆盖 base
  })
})

describe('resolveCredentials', () => {
  it('reads from accounts[accountId].clientId/clientSecret', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        dev: { clientId: 'cid1', clientSecret: 'csec1' },
      },
    })
    const creds = resolveCredentials(config, 'dev')
    expect(creds.clientId).toBe('cid1')
    expect(creds.clientSecret).toBe('csec1')
  })

  it('falls back to top-level clientId/clientSecret when account has none', () => {
    const config = DingtalkConfigSchema.parse({
      clientId: 'cid-top',
      clientSecret: 'csec-top',
      accounts: { dev: {} },
    })
    const creds = resolveCredentials(config, 'dev')
    expect(creds.clientId).toBe('cid-top')
    expect(creds.clientSecret).toBe('csec-top')
  })

  it('falls back to env vars when no inline credentials', () => {
    process.env.DINGTALK_CLIENT_ID = 'cid-env'
    process.env.DINGTALK_CLIENT_SECRET = 'csec-env'
    const creds = resolveCredentials(DingtalkConfigSchema.parse({}), 'default')
    expect(creds.clientId).toBe('cid-env')
    expect(creds.clientSecret).toBe('csec-env')
  })

  it('uses account-specific env vars when accountId != default', () => {
    process.env.DINGTALK_DEV_BOT_CLIENT_ID = 'cid-dev'
    process.env.DINGTALK_DEV_BOT_CLIENT_SECRET = 'csec-dev'
    const creds = resolveCredentials(DingtalkConfigSchema.parse({}), 'dev-bot')
    expect(creds.clientId).toBe('cid-dev')
    expect(creds.clientSecret).toBe('csec-dev')
  })

  it('throws when no source available', () => {
    expect(() => resolveCredentials(DingtalkConfigSchema.parse({}), 'unknown')).toThrow(/missing credentials/)
  })
})