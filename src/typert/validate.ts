/**
 * Config status — settings UI 顶部状态条.
 *
 * 检查 channel-dingtalk 配置健康度：
 *   - 凭证是否齐全
 *   - bindings 是否引用已存在的账号
 *   - 多账号启用计数
 *
 * 给 dsh-client-ui-settings-plugins 渲染 settings UI 顶部 banner 用。
 */

import type { DingtalkConfig } from '../../settings-schema.js'
import { validateBindings, listAccountIds } from '../apis/bindings.js'

export interface ConfigStatus {
  ok: boolean
  enabledCount: number
  missingAccountsInBindings: string[]
  warnings: string[]
  info: string[]
}

export function checkConfigStatus(config: DingtalkConfig): ConfigStatus {
  const enabledAccounts = listAccountIds(config)
  const result = validateBindings(config)
  const info: string[] = []
  const warnings: string[] = []

  // 1. credentials 健康度
  const hasTopCreds = !!config.clientId && !!config.clientSecret
  if (enabledAccounts.length === 1 && enabledAccounts[0] === 'default' && !hasTopCreds) {
    warnings.push('credentials_not_configured')
  } else if (enabledAccounts.length > 1) {
    // 多账号模式：每个 account 必须有自己的凭证（或环境变量）
    const accts = config.accounts ?? {}
    const unconfigured = enabledAccounts.filter((id) => {
      const a = accts[id]
      if (!a) return true
      return !a.clientId || !a.clientSecret
    })
    if (unconfigured.length > 0) {
      warnings.push(`partial_config:${unconfigured.join(',')}`)
    }
  }

  // 2. bindings 校验
  if (result.missing.length > 0) {
    warnings.push(`bindings_missing:${result.missing.join(',')}`)
  }

  // 3. 多账号启用计数
  info.push(`accounts_enabled:${enabledAccounts.length}`)

  return {
    ok: warnings.length === 0,
    enabledCount: enabledAccounts.length,
    missingAccountsInBindings: result.missing,
    warnings,
    info,
  }
}