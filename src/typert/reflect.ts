/**
 * ConfigStatusService — Remote service exposing config-status checks.
 *
 * PR-6c: 接入 @deepseek-ai/dsh-typert-protocol 的 @Remote 装饰器，
 *         让客户端（Web settings UI）可以通过 Host Gateway 远程调用
 *         checkConfigStatus()，而不必把整个 settings 文档传过去。
 *
 * 架构：
 *   - apply.ts: registerConfigStatusService(ctx)启动 Service
 *   - DSH Gateway: 暴露 endpoint /configStatus/check
 *   - Browser client: ctx.remote.configStatus.check(config) → 返回 { ok, warnings, ... }
 *
 * 注意：Typert decorators 在运行时把 metadata 存到 WeakMap 里
 * （参考 dsh-typert-protocol README），不需要 codegen 也能工作。
 * 真正的 schema 反射（暴露 zod → JSON Schema → Client 端类型）需要 generator，
 * 但本仓库的首版只需要把方法暴露到 Gateway 即可，不暴露复杂 schema。
 */

import { Context } from 'cordis'
import { TypertRemoteService, Remote, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { checkConfigStatus, type ConfigStatus } from './validate.js'
import { DingtalkConfigSchema, type DingtalkConfig } from '../../settings-schema.js'

export const CONFIG_STATUS_SERVICE_KEY = 'channel-dingtalk.configStatus'
export const CONFIG_STATUS_NAMESPACE = 'channelDingtalkConfigStatus'

/**
 * Service exposing channel-dingtalk config status checks over the Typert Gateway.
 *
 * Extends TypertRemoteService (from dsh-typert-protocol) which:
 *   - Registers with Cordis under CONFIG_STATUS_SERVICE_KEY
 *   - Binds the same key to Typert Gateway under CONFIG_STATUS_NAMESPACE
 *   - Exposes a `typertRemote` readonly binding for runtime introspection
 *
 * Methods decorated with @Remote become callable via ctx.remote from the browser:
 *   - check(config) → ConfigStatus
 *   - validate(config) → { ok: true } | { ok: false, errors: [...] }
 *   - listAccounts(config) → string[]
 *   - summary(config) → { ok, enabledCount, message }
 */
export class ConfigStatusService extends TypertRemoteService {
  /**
   * Status check: returns banner info + warnings.
   * Used by the settings UI top banner.
   */
  @Remote()
  check(config: DingtalkConfig): ConfigStatus {
    return checkConfigStatus(config)
  }

  /**
   * Schema validation: returns OK or zod error list.
   * Used by the debug "validate config" button.
   */
  @Remote()
  validate(config: unknown): { ok: true } | { ok: false; errors: Array<{ path: string; message: string }> } {
    const result = DingtalkConfigSchema.safeParse(config)
    if (result.success) return { ok: true }
    return {
      ok: false,
      errors: result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    }
  }

  /**
   * List all enabled account IDs.
   * Used by the bindings editor dropdown.
   */
  @Remote()
  listAccounts(config: DingtalkConfig): string[] {
    const accounts = config.accounts ?? {}
    return Object.keys(accounts).filter((id) => accounts[id]?.enabled !== false)
  }

  /**
   * Human-readable summary for the settings UI title bar.
   */
  @Remote()
  summary(config: DingtalkConfig): { ok: boolean; enabledCount: number; message: string } {
    const status = checkConfigStatus(config)
    return {
      ok: status.ok,
      enabledCount: status.enabledCount,
      message: status.ok
        ? `✅ All good · ${status.enabledCount} account(s)`
        : status.warnings[0] ?? 'Configuration has issues',
    }
  }
}

/**
 * Register the ConfigStatusService into Cordis + Typert Gateway.
 *
 * Called from apply.ts after the schema / settings are registered.
 *
 * Returns a disposer (for fiber-bound cleanup).
 */
export function registerConfigStatusService(ctx: Context): () => void {
  const service = new ConfigStatusService(ctx, CONFIG_STATUS_SERVICE_KEY, {
    namespace: CONFIG_STATUS_NAMESPACE,
  })

  // Print the @Remote-marked methods for debugging / loader introspection
  const markers = remoteMethods(service)
  if (process.env['DINGTALK_DEBUG_TYPERT']) {
    // eslint-disable-next-line no-console
    console.log(
      `[dingtalk-typert] ConfigStatusService @Remote methods: ${markers.map((m) => m.method).join(', ')}`,
    )
  }

  // Effect disposer: ctx disposes the service when the plugin's fiber unloads
  const dispose = ctx.effect(() => () => {
    // Service will be disposed by Cordis lifecycle; nothing else to do
  })
  return dispose
}

// =============================================================================
// Manual reflection artifact (forward-compatible with generator output)
// =============================================================================

/**
 * Mirror of the format that @deepseek-ai/dsh-typert-generator emits.
 *
 * The real generator reads TypeScript source code + zod schemas and produces
 * this shape. PR-6c hand-writes the same shape so that:
 *   1. The shape can be consumed by anyone expecting generator output (CI, docs)
 *   2. When the generator becomes stable on our type-version, we can swap
 *      this constant for `await generator.generate(...)` without changing
 *      downstream consumers
 *
 * Field meanings (from dsh-host-plugin-inventory/lib/typert.host.js):
 *   - package: npm package name
 *   - face: 'host' | 'client' (fork）
 *   - schemas: array of zod schemas (key = '<package>#<name>')
 *   - invocations: array of Remote method descriptors
 *   - model: { services, events, objects } — used by reflection consumers
 */
export const TYPERT_HOST_ARTIFACT = {
  package: '@local/dsh-channel-dingtalk',
  face: 'host',
  schemas: [
    {
      key: '@local/dsh-channel-dingtalk#DingtalkConfig',
      // Generator wraps each zod schema in their own runtime instance.
      // hand-written: we just return a schema reference.
      _wrapped: 'zod',
      _reference: 'DingtalkConfigSchema',
    },
  ],
  invocations: [
    {
      id: '@local/dsh-channel-dingtalk#configStatus/check',
      service: CONFIG_STATUS_SERVICE_KEY,
      namespace: CONFIG_STATUS_NAMESPACE,
      method: 'check',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'config',
          type: 'DingTalkConfig',
          zod: 'DingtalkConfigSchema',
        },
      ],
      result: {
        type: 'ConfigStatus',
        fields: {
          ok: 'boolean',
          enabledCount: 'number',
          missingAccountsInBindings: 'string[]',
          warnings: 'string[]',
          info: 'string[]',
        },
      },
    },
    {
      id: '@local/dsh-channel-dingtalk#configStatus/validate',
      service: CONFIG_STATUS_SERVICE_KEY,
      namespace: CONFIG_STATUS_NAMESPACE,
      method: 'validate',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'config', type: 'unknown' }],
      result: {
        type: 'union',
        variants: [
          { ok: 'true' },
          { ok: 'false', errors: '{ path: string, message: string }[]' },
        ],
      },
    },
    {
      id: '@local/dsh-channel-dingtalk#configStatus/listAccounts',
      service: CONFIG_STATUS_SERVICE_KEY,
      namespace: CONFIG_STATUS_NAMESPACE,
      method: 'listAccounts',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'config', type: 'DingTalkConfig' }],
      result: { type: 'string[]' },
    },
    {
      id: '@local/dsh-channel-dingtalk#configStatus/summary',
      service: CONFIG_STATUS_SERVICE_KEY,
      namespace: CONFIG_STATUS_NAMESPACE,
      method: 'summary',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'config', type: 'DingTalkConfig' }],
      result: {
        type: 'object',
        fields: {
          ok: 'boolean',
          enabledCount: 'number',
          message: 'string',
        },
      },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
} as const

export default TYPERT_HOST_ARTIFACT