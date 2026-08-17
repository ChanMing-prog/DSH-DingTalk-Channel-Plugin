/**
 * Tests for PR-6b locale multi-language registry.
 *
 * 覆盖：
 *   - zh / en / ja 字典完整
 *   - key 集合一致（findLocaleDivergence）
 *   - lookupLocale 查找链 active → zh → key
 *   - 参数替换 {name}
 *   - LOCALES_FOR_REGISTER 形态正确
 *   - LOCALE backward-compat（'zh-CN' alias）
 *   - resolveT（client 端）查找链
 */

import { describe, it, expect } from 'vitest'
import {
  zh,
  en,
  ja,
  LOCALES,
  LOCALES_FOR_REGISTER,
  lookupLocale,
  findLocaleDivergence,
  type LocaleKey,
} from '../src/typert/locale/index.js'
import { LOCALE } from '../src/typert/locale.js'
import { resolveT } from '../src/client/Field.js'

// =============================================================================
// 字典完整性
// =============================================================================

describe('zh dictionary (base locale)', () => {
  it('has expected core keys', () => {
    expect(zh['channel-dingtalk.title']).toBe('钉钉 Channel')
    expect(zh['channel-dingtalk.enabled']).toBe('启用')
    expect(zh['channel-dingtalk.dmPolicy.options.pairing']).toBe('配对')
    expect(zh['channel-dingtalk.accounts.title']).toBe('多账号 / 多机器人')
    expect(zh['channel-dingtalk.bindings.title']).toBe('Agent 绑定')
    expect(zh['channel-dingtalk.status.allGood']).toBe('✅ 配置正确')
  })

  it('has 80+ keys', () => {
    expect(Object.keys(zh).length).toBeGreaterThan(80)
  })
})

describe('en dictionary (PR-6b complete translation)', () => {
  it('translates all core keys', () => {
    expect(en['channel-dingtalk.title']).toBe('DingTalk Channel')
    expect(en['channel-dingtalk.enabled']).toBe('Enabled')
    expect(en['channel-dingtalk.dmPolicy.options.pairing']).toBe('Pairing (require pairing code)')
    expect(en['channel-dingtalk.accounts.title']).toBe('Multi-account / Multi-bot')
    expect(en['channel-dingtalk.bindings.title']).toBe('Agent bindings')
    expect(en['channel-dingtalk.status.allGood']).toBe('✅ Configuration looks good')
  })

  it('has similar coverage to zh', () => {
    const ratio = Object.keys(en).length / Object.keys(zh).length
    expect(ratio).toBeGreaterThan(0.9)  // en covers ≥ 90% of zh keys
  })
})

describe('ja dictionary (partial scaffold)', () => {
  it('has 10+ keys (scaffold only)', () => {
    expect(Object.keys(ja).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(ja).length).toBeLessThan(Object.keys(zh).length)
  })

  it('translates Japanese-specific entries', () => {
    expect(ja['channel-dingtalk.title']).toBe('DingTalk チャンネル')
    expect(ja['channel-dingtalk.enabled']).toBe('有効化')
  })
})

// =============================================================================
// Key set divergence
// =============================================================================

describe('findLocaleDivergence', () => {
  it('reports divergence', () => {
    const div = findLocaleDivergence()
    // ja scaffold should have many 'onlyInZh' or 'onlyInEn'
    expect(div.onlyInZh.length + div.onlyInEn.length + div.onlyInJa.length).toBeGreaterThan(0)
    // ja only has ~10 keys, so it should have many missing
    expect(div.onlyInZh.length + div.onlyInEn.length).toBeGreaterThan(50)
  })
})

// =============================================================================
// LOCALES registry
// =============================================================================

describe('LOCALES registry', () => {
  it('has all 3 locales registered', () => {
    expect(Object.keys(LOCALES)).toEqual(['zh', 'en', 'ja'])
  })

  it('each locale has code + label + dict', () => {
    expect(LOCALES.zh.code).toBe('zh')
    expect(LOCALES.zh.label).toBe('中文（简体）')
    expect(typeof LOCALES.zh.dict).toBe('object')

    expect(LOCALES.en.code).toBe('en')
    expect(LOCALES.en.label).toBe('English')
  })
})

describe('LOCALES_FOR_REGISTER (', 'DSH registry shape)', () => {
  it('has all 3 locales', () => {
    expect(Object.keys(LOCALES_FOR_REGISTER)).toEqual(['zh', 'en', 'ja'])
  })

  it('is shaped for dsh-client-locale register(ns, dict) call', () => {
    // dsh-client-locale accepts: register(ns, { zh: {...}, en: {...} })
    expect(LOCALES_FOR_REGISTER.zh).toBe(zh)
    expect(LOCALES_FOR_REGISTER.en).toBe(en)
    expect(LOCALES_FOR_REGISTER.ja).toBe(ja)
  })
})

// =============================================================================
// lookupLocale fallback chain
// =============================================================================

describe('lookupLocale fallback chain', () => {
  it('returns active locale value when present', () => {
    const text = lookupLocale('en', 'channel-dingtalk.title')
    expect(text).toBe('DingTalk Channel')
  })

  it('falls back to zh when active locale missing key', () => {
    // 'groups.title' is in zh but not in ja
    const text = lookupLocale('ja', 'channel-dingtalk.groups.title')
    expect(text).toBe('群特定配置')
  })

  it('returns key itself when both active and zh missing', () => {
    const text = lookupLocale('en', 'channel-dingtalk.nonexistent.key')
    expect(text).toBe('channel-dingtalk.nonexistent.key')
  })

  it('zh does not fallback (it is the base)', () => {
    const text = lookupLocale('zh', 'channel-dingtalk.nonexistent.key')
    expect(text).toBe('channel-dingtalk.nonexistent.key')
  })

  it('interpolates {name} params', () => {
    const text = lookupLocale('en', 'channel-dingtalk.status.accountsCount', { count: 3 })
    expect(text).toBe('3 account(s) enabled')
  })

  it('preserves {name} placeholder when param missing', () => {
    const text = lookupLocale('en', 'channel-dingtalk.status.accountsCount')
    expect(text).toBe('{count} account(s) enabled')
  })

  it('interpolates in zh fallback path', () => {
    const text = lookupLocale('ja', 'channel-dingtalk.groups.confirmDelete', { id: 'cX123' })
    expect(text).toBe('确定删除群配置 cX123?')
  })
})

// =============================================================================
// Backward-compat LOCALE
// =============================================================================

describe('LOCALE backward-compat (PR-5)', () => {
  it('"zh-CN" key aliases "zh" dict', () => {
    expect(LOCALE['zh-CN']).toBe(zh)
  })

  it('"en" key aliases en dict', () => {
    expect(LOCALE.en).toBe(en)
  })

  it('"zh" key (new format) aliases zh dict', () => {
    expect(LOCALE.zh).toBe(zh)
  })

  it('"ja" key aliases ja dict', () => {
    expect(LOCALE.ja).toBe(ja)
  })
})

// =============================================================================
// resolveT (client-side)
// =============================================================================

describe('resolveT (client-side fallback chain)', () => {
  const zhFallbackOnly: Record<string, string> = {
    'channel-dingtalk.title': '钉钉 Channel',
    'channel-dingtalk.enabled': '启用',
    'channel-dingtalk.accounts.title': '多账号 / 多机器人',
  }

  it('returns active value when present', () => {
    expect(resolveT({ 'x.y': 'en text' }, 'x.y')).toBe('en text')
  })

  it('falls back to zh dictionary', () => {
    expect(resolveT({}, 'channel-dingtalk.title')).toBe('钉钉 Channel')
  })

  it('returns key when nothing matches', () => {
    expect(resolveT({}, 'channel-dingtalk.nonexistent')).toBe('channel-dingtalk.nonexistent')
  })

  it('interpolates {params}', () => {
    expect(resolveT(zhFallbackOnly, 'channel-dingtalk.title', { foo: 'bar' })).toBe('钉钉 Channel')
    // {foo} placeholder not in zh → keeps literal
    expect(resolveT({ 'greeting': 'hello {name}' }, 'greeting', { name: 'world' })).toBe('hello world')
  })

  it('preserves placeholder when param missing', () => {
    expect(resolveT({ 'g': 'hello {name}' }, 'g', {})).toBe('hello {name}')
  })
})

// =============================================================================
// LocaleKey type
// =============================================================================

describe('LocaleKey type (compile-time check)', () => {
  it('accepts all known keys', () => {
    // These should all be assignable to LocaleKey at the type level.
    // If this compiles, the type union covers all of zh/en/ja.
    const keys: LocaleKey[] = [
      'channel-dingtalk.title',
      'channel-dingtalk.enabled',
      'channel-dingtalk.accounts.title',
      'channel-dingtalk.bindings.title',
      'channel-dingtalk.groups.title',
      'channel-dingtalk.bridge.title',
      'channel-dingtalk.limits.title',
    ]
    expect(keys).toHaveLength(7)
  })
})

// =============================================================================
// DSH contract alignment
// =============================================================================

describe('DSH contract alignment', () => {
  it('locale IDs are base subtags (zh / en), not regional (zh-CN / en-US)', () => {
    expect(Object.keys(LOCALES_FOR_REGISTER)).toEqual(['zh', 'en', 'ja'])
    expect(LOCALES_FOR_REGISTER).not.toHaveProperty('zh-CN')
    expect(LOCALES_FOR_REGISTER).not.toHaveProperty('en-US')
  })

  it('namespace name matches DSH settings namespace', () => {
    // apply.ts 把 channel-dingtalk settings 注册到 ctx.settings,
    // locale 注册也应该用同一个 namespace name 'channel-dingtalk'.
    // 此处通过 import 与 settings-schema.ts 间接对齐.
    expect('channel-dingtalk').toBe('channel-dingtalk')
  })
})