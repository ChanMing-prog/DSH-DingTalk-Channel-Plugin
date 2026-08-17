/**
 * Tests for PR-5 typert: locale, sections, manifest, validate.
 */

import { describe, it, expect } from 'vitest'
import { TYPERT } from '../src/typert/manifest.js'
import { LOCALE } from '../src/typert/locale.js'
import {
  SECTIONS,
  getSection,
  findSectionForField,
  validateSectionCoverage,
  validateSectionFieldsExist,
} from '../src/typert/sections.js'
import { checkConfigStatus } from '../src/typert/validate.js'
import typertIndex from '../src/typert/index.js'
import { DingtalkConfigSchema } from '../settings-schema.js'

// =============================================================================
// Manifest
// =============================================================================

describe('TYPERT manifest', () => {
  it('exports required fields', () => {
    expect(TYPERT.package).toBe('@local/dsh-channel-dingtalk')
    expect(TYPERT.face).toBe('host')
    expect(TYPERT.contributions).toBeDefined()
    expect(TYPERT.locale).toBeDefined()
    expect(TYPERT.schemaHints).toBeDefined()
  })

  it('contributes to settings.plugins.tab and settings.plugin.item', () => {
    expect(TYPERT.contributions['settings.plugins.tab']).toBeDefined()
    expect(TYPERT.contributions['settings.plugins.tab'].id).toBe('channel-dingtalk')
    expect(TYPERT.contributions['settings.plugin.item']).toBeDefined()
  })

  it('tab and item have matching ids', () => {
    const tab = TYPERT.contributions['settings.plugins.tab']
    const item = TYPERT.contributions['settings.plugin.item']
    expect(tab.id).toBe('channel-dingtalk')
    expect(item.id).toBe('channel-dingtalk.card')
  })

  it('item references sections', () => {
    const item = TYPERT.contributions['settings.plugin.item']
    expect(item.sections).toBeDefined()
    expect(Array.isArray(item.sections)).toBe(true)
  })

  it('labels are bilingual (zh-CN + en)', () => {
    const tab = TYPERT.contributions['settings.plugins.tab']
    expect(tab.label['zh-CN']).toBeTruthy()
    expect(tab.label.en).toBeTruthy()
  })

  it('schemaHints mark multi-account fields', () => {
    expect(TYPERT.schemaHints.multiAccountFields).toContain('accounts')
    expect(TYPERT.schemaHints.bindingsField).toBe('bindings')
    expect(TYPERT.schemaHints.secretFields).toContain('clientSecret')
  })

  it('default-export = named-export', () => {
    expect(typertIndex).toBe(TYPERT)
  })
})

// =============================================================================
// Locale
// =============================================================================

describe('LOCALE', () => {
  it('has both zh-CN and en dictionaries', () => {
    expect(LOCALE['zh-CN']).toBeDefined()
    expect(LOCALE.en).toBeDefined()
  })

  it('all keys exist in both dictionaries', () => {
    const zhKeys = new Set(Object.keys(LOCALE['zh-CN']))
    const enKeys = new Set(Object.keys(LOCALE.en))
    expect(zhKeys.size).toBeGreaterThan(30)
    for (const k of zhKeys) expect(enKeys.has(k)).toBe(true)
    for (const k of enKeys) expect(zhKeys.has(k)).toBe(true)
  })

  it('every key starts with channel-dingtalk.', () => {
    for (const k of Object.keys(LOCALE['zh-CN'])) {
      expect(k.startsWith('channel-dingtalk.')).toBe(true)
    }
  })

  it('options.<enum> keys exist for enum-typed fields', () => {
    expect(LOCALE['zh-CN']['channel-dingtalk.dmPolicy.options.open']).toBeTruthy()
    expect(LOCALE['zh-CN']['channel-dingtalk.dmPolicy.options.pairing']).toBeTruthy()
    expect(LOCALE['zh-CN']['channel-dingtalk.dmPolicy.options.allowlist']).toBeTruthy()
    expect(LOCALE['zh-CN']['channel-dingtalk.groupPolicy.options.disabled']).toBeTruthy()
    expect(LOCALE['zh-CN']['channel-dingtalk.inboxWakeup.options.followup']).toBeTruthy()
    expect(LOCALE['zh-CN']['channel-dingtalk.inboxWakeup.options.steer']).toBeTruthy()
  })

  it('values are non-empty strings', () => {
    for (const [k, v] of Object.entries(LOCALE['zh-CN'])) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })
})

// =============================================================================
// Sections
// =============================================================================

describe('SECTIONS', () => {
  it('has 9 sections', () => {
    expect(SECTIONS).toHaveLength(9)
  })

  it('sections are sorted by order', () => {
    for (let i = 1; i < SECTIONS.length; i++) {
      expect(SECTIONS[i].order).toBeGreaterThan(SECTIONS[i - 1].order)
    }
  })

  it('every section has a unique id', () => {
    const ids = new Set<string>()
    for (const s of SECTIONS) {
      expect(ids.has(s.id)).toBe(false)
      ids.add(s.id)
    }
  })

  it('getSection returns section by id', () => {
    expect(getSection('accounts')?.id).toBe('accounts')
    expect(getSection('nonexistent')).toBeUndefined()
  })

  it('findSectionForField returns section by field', () => {
    expect(findSectionForField('accounts')?.id).toBe('accounts')
    expect(findSectionForField('bindings')?.id).toBe('bindings')
    expect(findSectionForField('dmPolicy')?.id).toBe('dmPolicy')
    expect(findSectionForField('nonexistent')).toBeUndefined()
  })

  it('accounts section is marked with customWidget accounts-list', () => {
    expect(getSection('accounts')?.customWidget).toBe('accounts-list')
  })

  it('bindings section is marked with customWidget bindings-list', () => {
    expect(getSection('bindings')?.customWidget).toBe('bindings-list')
  })

  it('groups section is marked with customWidget groups-dict', () => {
    expect(getSection('groupPolicy')?.customWidget).toBe('groups-dict')
  })

  it('accounts section is not collapsed by default', () => {
    expect(getSection('accounts')?.collapsedByDefault).toBe(false)
  })
})

describe('Section coverage validation', () => {
  const ALL_FIELDS = [
    'enabled',
    'defaultAccount',
    'clientId',
    'clientSecret',
    'enableMediaUpload',
    'systemPrompt',
    'dmPolicy',
    'allowFrom',
    'groupPolicy',
    'groupAllowFrom',
    'requireMention',
    'groups',
    'historyLimit',
    'textChunkLimit',
    'mediaMaxMb',
    'routes',
    'accounts',
    'bindings',
    'inboxWakeup',
    'streamTimeoutMs',
    'jobsControllerName',
    'aiCardReuseMs',
    'toolsOnly',
  ] as const

  it('all schema fields are covered by sections', () => {
    const missing = validateSectionCoverage(ALL_FIELDS)
    expect(missing).toEqual([])
  })

  it('no orphan fields in sections', () => {
    const orphans = validateSectionFieldsExist(ALL_FIELDS)
    expect(orphans).toEqual([])
  })

  it('detects missing coverage', () => {
    const missing = validateSectionCoverage(['enabled', 'unknownField'])
    expect(missing).toContain('unknownField')
  })

  it('detects orphan fields', () => {
    const orphans = validateSectionFieldsExist(['enabled'])
    expect(orphans.length).toBeGreaterThan(0)
    expect(orphans).toContain('accounts.clientId') // clientId not in reduced schema
  })
})

// =============================================================================
// Config status validation
// =============================================================================

describe('checkConfigStatus', () => {
  it('reports notConfigured when no credentials', () => {
    const config = DingtalkConfigSchema.parse({})
    const status = checkConfigStatus(config)
    expect(status.ok).toBe(false)
    expect(status.warnings).toContain('credentials_not_configured')
  })

  it('reports ok when credentials present (single-account)', () => {
    const config = DingtalkConfigSchema.parse({
      clientId: 'cid',
      clientSecret: 'csec',
    })
    const status = checkConfigStatus(config)
    expect(status.ok).toBe(true)
    expect(status.enabledCount).toBe(1)
  })

  it('reports enabledCount for multi-account', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'a': { clientId: 'a', clientSecret: 'a' },
        'b': { clientId: 'b', clientSecret: 'b' },
        'c': { enabled: false, clientId: 'c', clientSecret: 'c' },
      },
    })
    const status = checkConfigStatus(config)
    expect(status.enabledCount).toBe(2)
  })

  it('reports partial_config when some accounts lack credentials', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: {
        'a': { clientId: 'a', clientSecret: 'a' },
        'b': {}, // no credentials
      },
    })
    const status = checkConfigStatus(config)
    expect(status.ok).toBe(false)
    expect(status.warnings.some((w) => w.startsWith('partial_config:'))).toBe(true)
  })

  it('reports bindings_missing when bindings reference unknown accounts', () => {
    const config = DingtalkConfigSchema.parse({
      accounts: { 'a': { clientId: 'a', clientSecret: 'a' } },
      bindings: [
        { agentId: 'agent1', match: { channel: 'dingtalk-connector', accountId: 'ghost' } },
      ],
    })
    const status = checkConfigStatus(config)
    expect(status.missingAccountsInBindings).toContain('ghost')
    expect(status.warnings.some((w) => w.startsWith('bindings_missing:'))).toBe(true)
  })

  it('emits accounts_enabled info', () => {
    const config = DingtalkConfigSchema.parse({
      clientId: 'cid',
      clientSecret: 'csec',
    })
    const status = checkConfigStatus(config)
    expect(status.info.some((i) => i.startsWith('accounts_enabled:'))).toBe(true)
  })
})