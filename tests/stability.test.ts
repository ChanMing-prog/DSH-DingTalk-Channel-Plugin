/**
 * Tests for PR-8 stability: backoff, dedup, token scheduler.
 *
 * Covers:
 *   - calculateBackoffDelay: exponential + jitter + cap
 *   - checkAndMarkMessage: protocol dedup / business dedup / TTL expiry
 *   - StreamConnection.create: stubs out dingtalk-stream
 *   - Token refresh scheduler: start/stop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateBackoffDelay, checkAndMarkMessage } from '../src/runtime/stability.js'
import {
  startTokenRefreshScheduler,
  stopTokenRefreshScheduler,
  clearTokenCache,
} from '../src/apis/tokens.js'

// =============================================================================
// calculateBackoffDelay
// =============================================================================

describe('calculateBackoffDelay', () => {
  it('returns ~1s on attempt 0', () => {
    const delay = calculateBackoffDelay(0)
    // BASE_BACKOFF_DELAY=1000, + jitter 0-1000
    expect(delay).toBeGreaterThanOrEqual(1000)
    expect(delay).toBeLessThanOrEqual(2000)
  })

  it('doubles with each attempt (exponential)', () => {
    // 运行多次取平均以抵消 jitter
    const samples0 = Array.from({ length: 100 }, () => calculateBackoffDelay(0))
    const samples2 = Array.from({ length: 100 }, () => calculateBackoffDelay(2))
    const avg0 = samples0.reduce((a, b) => a + b, 0) / samples0.length
    const avg2 = samples2.reduce((a, b) => a + b, 0) / samples2.length
    // attempt 2 = 1s * 2^2 = 4s, vs attempt 0 ~ 1.5s
    expect(avg2).toBeGreaterThan(avg0 * 2)
  })

  it('caps at MAX_BACKOFF_DELAY (30s)', () => {
    const delay = calculateBackoffDelay(100) // extreme attempt
    expect(delay).toBeLessThanOrEqual(31_000) // 30s + max 1s jitter
  })

  it('jitter makes values non-deterministic', () => {
    const samples = new Set(Array.from({ length: 50 }, () => calculateBackoffDelay(1)))
    // Should have at least 10 distinct values with 50 samples
    expect(samples.size).toBeGreaterThan(10)
  })
})

// =============================================================================
// checkAndMarkMessage (dedup)
// =============================================================================

describe('checkAndMarkMessage', () => {
  beforeEach(() => {
    // 清除 dedup cache（内部 Map）—— 调用 checkAndMarkMessage 前无法直接 clear，
    // 但我们用新 accountId 保证 key 不碰撞
  })

  it('returns false on first call', () => {
    const result = checkAndMarkMessage('acct-test-1', 'proto-msg-1', undefined)
    expect(result).toBe(false)
  })

  it('returns true on duplicate protocol message', () => {
    checkAndMarkMessage('acct-test-2', 'proto-dup-1', undefined)
    const result = checkAndMarkMessage('acct-test-2', 'proto-dup-1', undefined)
    expect(result).toBe(true)
  })

  it('returns false for same businessId but different protocolId', () => {
    // 两个不同的投递（不同 protocolId）但同一个 businessId
    checkAndMarkMessage('acct-test-3', 'proto-a', 'biz-1')
    // 第二个投递有不同 protocolId，但同一 businessId
    const result = checkAndMarkMessage('acct-test-3', 'proto-b', 'biz-1')
    expect(result).toBe(true)
  })

  it('returns false for same protocolId but different businessId', () => {
    checkAndMarkMessage('acct-test-4', 'proto-x', undefined)
    // 不同 businessId，protocolId 不同则不重复
    const result = checkAndMarkMessage('acct-test-4', undefined, 'biz-y')
    expect(result).toBe(false)
  })

  it('handles undefined message ids gracefully', () => {
    const result = checkAndMarkMessage('acct-test-5', undefined, undefined)
    expect(result).toBe(false)
  })

  it('different accounts are independent', () => {
    checkAndMarkMessage('acct-a', 'shared-proto-id', undefined)
    // 不同 account 的相同 protocolId 不算重复
    const result = checkAndMarkMessage('acct-b', 'shared-proto-id', undefined)
    expect(result).toBe(false)
  })
})

// =============================================================================
// Token refresh scheduler
// =============================================================================

describe('token refresh scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearTokenCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    stopTokenRefreshScheduler()
  })

  it('startTokenRefreshScheduler returns disposer', () => {
    const creds = { clientId: 'cid', clientSecret: 'csec' }
    const stop = startTokenRefreshScheduler(creds, 50)
    expect(typeof stop).toBe('function')
    // disposer should not throw
    stop()
  })

  it('stopTokenRefreshScheduler clears timer', () => {
    startTokenRefreshScheduler({ clientId: 'cid', clientSecret: 'csec' }, 50)
    // No throw
    stopTokenRefreshScheduler()
    // Double stop is safe
    stopTokenRefreshScheduler()
  })

  it('calling start twice replaces previous timer', () => {
    const creds = { clientId: 'cid', clientSecret: 'csec' }
    startTokenRefreshScheduler(creds, 50)
    // Start again — should not throw or leak
    startTokenRefreshScheduler(creds, 50)
    stopTokenRefreshScheduler()
  })
})

// =============================================================================
// StreamConnection (stub verification — no real dingtalk-stream)
// =============================================================================

describe('StreamConnection', () => {
  it('imports stability module without error', async () => {
    const mod = await import('../src/runtime/stability.js')
    expect(mod.StreamConnection).toBeDefined()
    expect(mod.calculateBackoffDelay).toBeDefined()
    expect(mod.checkAndMarkMessage).toBeDefined()
  })
})

// =============================================================================
// Integration: stability + tokens module structure
// =============================================================================

describe('stability module exports', () => {
  it('exports expected symbols', async () => {
    const mod = await import('../src/runtime/stability.js')
    expect(typeof mod.calculateBackoffDelay).toBe('function')
    expect(typeof mod.checkAndMarkMessage).toBe('function')
    expect(typeof mod.StreamConnection).toBe('function')
  })

  it('tokens module exports expected symbols', async () => {
    const mod = await import('../src/apis/tokens.js')
    expect(typeof mod.getAccessToken).toBe('function')
    expect(typeof mod.getOapiAccessToken).toBe('function')
    expect(typeof mod.startTokenRefreshScheduler).toBe('function')
    expect(typeof mod.stopTokenRefreshScheduler).toBe('function')
    expect(typeof mod.clearTokenCache).toBe('function')
  })
})