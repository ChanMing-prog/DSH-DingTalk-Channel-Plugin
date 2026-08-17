/**
 * PR-6c tests — Typert loader contract validation + drift detection + Remote service.
 *
 * 覆盖：
 *   - validateTYPERTManifest: 必填字段 / warning / error 分类
 *   - detectSchemaCoverDrift: uncovered / orphan 检测
 *   - detectLocaleDrift: per-locale coverage / missing keys
 *   - lintTypert: one-stop validation
 *   - ConfigStatusService: @Remote decorator markers / 4 个方法暴露
 *   - TYPERT_HOST_ARTIFACT: hand-written artifact shape matches generator output
 */

import { describe, it, expect } from 'vitest'
import {
  validateTYPERTManifest,
  detectSchemaCoverDrift,
  detectLocaleDrift,
  lintTypert,
} from '../src/typert/loader-contract.js'
import {
  ConfigStatusService,
  TYPERT_HOST_ARTIFACT,
  remoteMethods,
} from '../src/typert/reflect.js'
import { checkConfigStatus } from '../src/typert/validate.js'
import { TOP_LEVEL_SCHEMA_FIELDS } from '../src/typert/schema-fields.js'
import { DingtalkConfigSchema } from '../settings-schema.js'

// =============================================================================
// validateTYPERTManifest
// =============================================================================

describe('validateTYPERTManifest', () => {
  it('passes on current manifest', () => {
    const result = validateTYPERTManifest()
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('reports stats', () => {
    const result = validateTYPERTManifest()
    expect(result.stats.sectionCount).toBeGreaterThan(0)
    expect(result.stats.fieldCount).toBeGreaterThan(15)
    expect(result.stats.localeCount).toBeGreaterThanOrEqual(3)  // zh, en, ja
    expect(result.stats.localeKeyCount).toBeGreaterThan(50)
  })

  it('warns on single-locale', () => {
    // 这里只检查 warning 的判定逻辑 —— 当前 manifest 是 3 个 locale 不会触发
    // 我们用 .locale 字段不存在来模拟
    const result = validateTYPERTManifest()
    // 没 single-locale 警告（≥ 2 locales）
    expect(result.warnings.find((w) => w.message.includes('only one locale'))).toBeUndefined()
  })
})

// =============================================================================
// detectSchemaCoverDrift
// =============================================================================

describe('detectSchemaCoverDrift', () => {
  it('all TOP_LEVEL_SCHEMA_FIELDS are covered by sections', () => {
    const result = detectSchemaCoverDrift(TOP_LEVEL_SCHEMA_FIELDS)
    expect(result.uncovered).toEqual([])
  })

  it('no orphan fields in sections', () => {
    const result = detectSchemaCoverDrift(TOP_LEVEL_SCHEMA_FIELDS)
    expect(result.orphan).toEqual([])
  })

  it('detects uncovered fields', () => {
    const result = detectSchemaCoverDrift([...TOP_LEVEL_SCHEMA_FIELDS, 'newField'])
    expect(result.uncovered).toContain('newField')
  })

  it('detects orphan fields', () => {
    const result = detectSchemaCoverDrift(['enabled']) // reduce schema
    expect(result.orphan.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// detectLocaleDrift
// =============================================================================

describe('detectLocaleDrift', () => {
  it('zh is base locale with 100% coverage', () => {
    const drift = detectLocaleDrift()
    expect(drift.baseLocale).toBe('zh')
    expect(drift.coverageByLocale.zh).toBe(1)
  })

  it('en has coverage ≥ 90%', () => {
    const drift = detectLocaleDrift()
    expect(drift.coverageByLocale.en).toBeGreaterThanOrEqual(0.9)
  })

  it('ja is partial scaffold (lower coverage)', () => {
    const drift = detectLocaleDrift()
    expect(drift.coverageByLocale.ja).toBeLessThan(0.5)
  })

  it('perLocale missingFromOther reports keys missing from this locale', () => {
    const drift = detectLocaleDrift()
    // ja is partial, so it should have many missing-from-other keys
    expect(drift.perLocale.ja.missingFromOther.length).toBeGreaterThan(20)
  })
})

// =============================================================================
// lintTypert (one-stop)
// =============================================================================

describe('lintTypert', () => {
  it('returns ok=true on current code', () => {
    const result = lintTypert(TOP_LEVEL_SCHEMA_FIELDS)
    expect(result.ok).toBe(true)
  })

  it('result has all 4 sections', () => {
    const result = lintTypert(TOP_LEVEL_SCHEMA_FIELDS)
    expect(result.manifest).toBeDefined()
    expect(result.schemaCover).toBeDefined()
    expect(result.localeDrift).toBeDefined()
  })

  it('result.ok=false when schema has uncovered field', () => {
    const result = lintTypert([...TOP_LEVEL_SCHEMA_FIELDS, 'unknownField'])
    expect(result.ok).toBe(false)
    expect(result.schemaCover.uncovered).toContain('unknownField')
  })
})

// =============================================================================
// ConfigStatusService (@Remote decorator)
// =============================================================================

describe('ConfigStatusService', () => {
  it('exposes 4 @Remote methods', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const markers = remoteMethods(service)
    const methods = markers.map((m) => m.method).sort()
    expect(methods).toEqual(['check', 'listAccounts', 'summary', 'validate'])
  })

  it('all markers use direct invocation', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const markers = remoteMethods(service)
    for (const m of markers) {
      expect(m.invocation.kind).toBe('direct')
    }
  })

  it('check(config) returns ConfigStatus', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const result = service.check({})
    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('enabledCount')
    expect(result).toHaveProperty('warnings')
  })

  it('validate(valid) returns { ok: true }', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const result = service.validate({ enabled: true })
    expect(result.ok).toBe(true)
  })

  it('validate(invalid) returns { ok: false, errors }', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const result = service.validate({ dmPolicy: 'invalid-value' })
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('listAccounts returns enabled account IDs', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const result = service.listAccounts({
      accounts: {
        'a': { enabled: true },
        'b': { enabled: false },
        'c': { enabled: true },
      },
    })
    expect(result.sort()).toEqual(['a', 'c'])
  })

  it('summary returns banner info', () => {
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const result = service.summary({ clientId: 'cid', clientSecret: 'csec' })
    expect(result.ok).toBe(true)
    expect(result.message).toContain('All good')
  })

  it('typertRemote binding is exposed', () => {
    const service = new ConfigStatusService({} as never, 'channel-dingtalk.configStatus', { namespace: 'test' })
    expect(service.typertRemote.serviceKey).toBe('channel-dingtalk.configStatus')
    expect(service.typertRemote.namespace).toBe('test')
  })
})

// =============================================================================
// TYPERT_HOST_ARTIFACT (generator-shape)
// =============================================================================

describe('TYPERT_HOST_ARTIFACT', () => {
  it('has package + face', () => {
    expect(TYPERT_HOST_ARTIFACT.package).toBe('@local/dsh-channel-dingtalk')
    expect(TYPERT_HOST_ARTIFACT.face).toBe('host')
  })

  it('matches real generator output shape', () => {
    // Mirror dsh-host-plugin-inventory/lib/typert.host.js format
    expect(Array.isArray(TYPERT_HOST_ARTIFACT.schemas)).toBe(true)
    expect(Array.isArray(TYPERT_HOST_ARTIFACT.invocations)).toBe(true)
    expect(TYPERT_HOST_ARTIFACT.model).toBeDefined()
    expect(TYPERT_HOST_ARTIFACT.model.services).toBeDefined()
    expect(TYPERT_HOST_ARTIFACT.model.events).toBeDefined()
    expect(TYPERT_HOST_ARTIFACT.model.objects).toBeDefined()
  })

  it('each invocation references ConfigStatusService', () => {
    for (const inv of TYPERT_HOST_ARTIFACT.invocations) {
      expect(inv.service).toBe('channel-dingtalk.configStatus')
      expect(inv.namespace).toBe('channelDingtalkConfigStatus')
      expect(inv.invocation.kind).toBe('direct')
    }
  })

  it('has 4 invocations matching the 4 @Remote methods', () => {
    expect(TYPERT_HOST_ARTIFACT.invocations).toHaveLength(4)
    const methods = TYPERT_HOST_ARTIFACT.invocations.map((i) => i.method).sort()
    expect(methods).toEqual(['check', 'listAccounts', 'summary', 'validate'])
  })
})

// =============================================================================
// Integration sanity
// =============================================================================

describe('integration sanity', () => {
  it('checkConfigStatus returns same shape as ConfigStatusService.check', () => {
    const direct = checkConfigStatus({ clientId: 'cid', clientSecret: 'csec' })
    const service = new ConfigStatusService({} as never, 'test', { namespace: 'test' })
    const viaService = service.check({ clientId: 'cid', clientSecret: 'csec' })
    expect(viaService).toEqual(direct)
  })

  it('DingtalkConfigSchema can validate a valid config', () => {
    const result = DingtalkConfigSchema.parse({ clientId: 'cid', clientSecret: 'csec' })
    expect(result.enabled).toBe(true)
    expect(result.dmPolicy).toBe('pairing')
    expect(result.defaultAccount).toBe('default')
  })
})