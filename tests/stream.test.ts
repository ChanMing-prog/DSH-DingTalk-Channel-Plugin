/**
 * Smoke test: routeSession + policy — 不依赖任何运行时 DSH / dingtalk-stream
 *
 * 验证最关键的纯函数逻辑（无 IO）：
 *   1. routeSession: 私聊/群/group_sender 三种 scope 映射正确
 *   2. policy: dmPolicy=pairing 第一次拒绝、第二次接受
 *   3. policy: groupPolicy=allowlist + requireMention + sender 不在白名单 → 拒绝
 */

import { describe, it, expect } from 'vitest'
import { routeSession } from '../src/runtime/session-routing.js'
import { handleMessagePolicy } from '../src/runtime/policy.js'
import { DingtalkConfigSchema } from '../settings-schema.js'
import type { BridgeContext, DingtalkInboundMessage } from '../src/types.js'

function makeConfig() {
  return DingtalkConfigSchema.parse({})
}

function makeBctx(): BridgeContext {
  const config = makeConfig()
  return {
    ctx: {} as never,
    config,
    credentials: { clientId: 'cid', clientSecret: 'csec' },
    handleCache: new Map(),
    cardCache: new Map(),
    pairedStaffIds: new Set(),
  }
}

function msg(overrides: Partial<DingtalkInboundMessage>): DingtalkInboundMessage {
  return {
    messageId: 'm1',
    conversationType: '2',
    conversationId: 'cXXXXXX',
    senderStaffId: 'staffA',
    senderNick: 'Alice',
    msgType: 'text',
    text: { content: 'hi' },
    isInAtList: true,
    raw: {},
    receivedAt: 0,
    ...overrides,
  }
}

describe('routeSession', () => {
  it('私聊映射成 dingtalk:d:<id>', () => {
    const bctx = makeBctx()
    const routing = routeSession(bctx, msg({ conversationType: '1', conversationId: 'staffA' }))
    expect(routing.sessionId).toBe('dingtalk:d:staffA')
    expect(routing.agentScope).toBe('main')
  })

  it('群聊默认 group scope → dingtalk:g:<id>', () => {
    const bctx = makeBctx()
    const routing = routeSession(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX' }))
    expect(routing.sessionId).toBe('dingtalk:g:cXXXXXX')
  })

  it('群聊 group_sender scope → dingtalk:g:<id>:s:<sender>', () => {
    const bctx = makeBctx()
    bctx.config.groups = { cXXXXXX: { groupSessionScope: 'group_sender' } }
    const routing = routeSession(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX', senderStaffId: 'staffA' }))
    expect(routing.sessionId).toBe('dingtalk:g:cXXXXXX:s:staffA')
  })

  it('routes 显式指定 agentScope', () => {
    const bctx = makeBctx()
    bctx.config.routes = [{ conversationId: 'cXXXXXX', agentScope: 'coding-only' }]
    const routing = routeSession(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX' }))
    expect(routing.agentScope).toBe('coding-only')
  })
})

describe('handleMessagePolicy', () => {
  it('dmPolicy=pairing 第一次拒绝', () => {
    const bctx = makeBctx()
    bctx.config.dmPolicy = 'pairing'
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '1', conversationId: 'staffA', senderStaffId: 'staffA' }))
    expect(decision.accept).toBe(false)
  })

  it('dmPolicy=pairing 已配对后接受', () => {
    const bctx = makeBctx()
    bctx.config.dmPolicy = 'pairing'
    bctx.pairedStaffIds.add('staffA')
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '1', conversationId: 'staffA', senderStaffId: 'staffA' }))
    expect(decision.accept).toBe(true)
  })

  it('群 allowlist 为空时拒绝', () => {
    const bctx = makeBctx()
    bctx.config.groupPolicy = 'allowlist'
    bctx.config.groupAllowFrom = []
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX' }))
    expect(decision.accept).toBe(false)
  })

  it('群 requireMention + 未 @ → 拒绝', () => {
    const bctx = makeBctx()
    bctx.config.groupPolicy = 'open'
    bctx.config.requireMention = true
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX', isInAtList: false }))
    expect(decision.accept).toBe(false)
  })

  it('群 requireMention + 已 @ → 接受', () => {
    const bctx = makeBctx()
    bctx.config.groupPolicy = 'open'
    bctx.config.requireMention = true
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX', isInAtList: true }))
    expect(decision.accept).toBe(true)
  })

  it('全局 allowFrom 不匹配 → 拒绝', () => {
    const bctx = makeBctx()
    bctx.config.groupPolicy = 'open'
    bctx.config.allowFrom = ['staffAllowed']
    const decision = handleMessagePolicy(bctx, msg({ conversationType: '2', conversationId: 'cXXXXXX', senderStaffId: 'staffOther' }))
    expect(decision.accept).toBe(false)
  })
})