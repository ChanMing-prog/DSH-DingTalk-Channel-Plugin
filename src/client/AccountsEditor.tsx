/**
 * AccountsEditor — 多账号 / 多机器人可视化编辑.
 *
 * 视觉上是一组可折叠的 account panel 列表。每个 panel：
 *   - accountId（首行徽章）
 *   - 启用开关
 *   - 友好名（mention 解析用）
 *   - ChatbotUserId（钉钉侧加密机器人 ID）
 *   - Client ID / Client Secret
 *   - 私聊/群聊策略 + 白名单
 *   - 删除按钮
 *
 * 顶部 [+ 新增账号] 按钮.
 */

import { useState } from 'react'
import { Button, CheckboxField, SelectField, TextField, useT } from './Field.js'
import type { DingTalkConfig, DingtalkDraft, Locale } from './types.js'

type Account = NonNullable<DingTalkConfig['accounts']>[string]

const DEFAULT_ACCOUNT: Account = {
  enabled: true,
  name: '',
  chatbotUserId: '',
  clientId: '',
  clientSecret: '',
  dmPolicy: undefined,
  allowFrom: [],
  groupPolicy: undefined,
  groupAllowFrom: [],
  requireMention: undefined,
}

interface Props {
  config: DingTalkConfig
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  locale: Locale
}

export function AccountsEditor({ config, draft, onChange, locale }: Props) {
  const t = useT(locale)
  const accounts = (draft.accounts ?? config.accounts ?? {}) as Record<string, Account>
  const accountIds = Object.keys(accounts)

  const updateAccounts = (next: Record<string, Account>) => {
    onChange({ ...draft, accounts: next })
  }
  const updateAccount = (id: string, patch: Partial<Account>) => {
    updateAccounts({ ...accounts, [id]: { ...(accounts[id] ?? DEFAULT_ACCOUNT), ...patch } })
  }
  const addAccount = () => {
    // 生成唯一 accountId
    let i = accountIds.length + 1
    let id = `bot-${i}`
    while (id in accounts) {
      i++
      id = `bot-${i}`
    }
    updateAccounts({ ...accounts, [id]: { ...DEFAULT_ACCOUNT } })
  }
  const removeAccount = (id: string) => {
    if (!confirm(t('channel-dingtalk.accounts.confirmDelete', { id }))) return
    const { [id]: _removed, ...rest } = accounts
    updateAccounts(rest)
  }

  return (
    <div className="dct-section">
      <h3 className="dct-section--title">{t('channel-dingtalk.accounts.title')}</h3>
      <p className="dct-field--hint">{t('channel-dingtalk.accounts.description')}</p>

      <div className="dct-accounts">
        {accountIds.length === 0 && (
          <p className="dct-field--hint">{t('channel-dingtalk.accounts.empty')}</p>
        )}
        {accountIds.map((id) => (
          <AccountPanel
            key={id}
            accountId={id}
            account={accounts[id]}
            onChange={(patch) => updateAccount(id, patch)}
            onRemove={() => removeAccount(id)}
            locale={locale}
            config={config}
            draft={draft}
          />
        ))}
      </div>

      <Button onClick={addAccount} variant="primary">
        + {t('channel-dingtalk.accounts.add')}
      </Button>
    </div>
  )
}

interface AccountPanelProps {
  accountId: string
  account: Account
  config: DingTalkConfig
  draft: DingtalkDraft
  onChange: (patch: Partial<Account>) => void
  onRemove: () => void
  locale: Locale
}

function AccountPanel({
  accountId,
  account,
  config,
  draft,
  onChange,
  onRemove,
  locale,
}: AccountPanelProps) {
  const t = useT(locale)
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="dct-account">
      <div className="dct-account--header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code className="dct-account--id">{accountId}</code>
          {account.name && <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{account.name}</span>}
          {!account.enabled && (
            <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
              ({t('channel-dingtalk.accounts.disabled')})
            </span>
          )}
        </div>
        <div className="dct-account--actions">
          <Button onClick={() => setExpanded(!expanded)}>{expanded ? '▾' : '▸'}</Button>
          <Button onClick={onRemove} variant="danger">
            ×
          </Button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="dct-account--body">
            <CheckboxField
              label={t('channel-dingtalk.accounts.enabled')}
              checked={account.enabled}
              onChange={(v) => onChange({ enabled: v })}
            />
            <TextField
              label={t('channel-dingtalk.accounts.name')}
              hint={t('channel-dingtalk.accounts.name.description')}
              value={account.name}
              onChange={(v) => onChange({ name: v })}
            />
            <TextField
              label={t('channel-dingtalk.accounts.chatbotUserId')}
              hint={t('channel-dingtalk.accounts.chatbotUserId.description')}
              value={account.chatbotUserId}
              placeholder="$:LWCP_v1:$..."
              onChange={(v) => onChange({ chatbotUserId: v })}
            />
            <TextField
              label={t('channel-dingtalk.clientId')}
              value={account.clientId}
              onChange={(v) => onChange({ clientId: v })}
            />
            <TextField
              label={t('channel-dingtalk.clientSecret')}
              hint={t('channel-dingtalk.clientSecret.description')}
              value={extractSecretDisplay(account.clientSecret)}
              type="password"
              onChange={(v) => onChange({ clientSecret: v })}
            />
            <SelectField
              label={t('channel-dingtalk.dmPolicy')}
              value={account.dmPolicy}
              options={[
                { value: 'open', label: t('channel-dingtalk.dmPolicy.options.open') },
                { value: 'pairing', label: t('channel-dingtalk.dmPolicy.options.pairing') },
                { value: 'allowlist', label: t('channel-dingtalk.dmPolicy.options.allowlist') },
              ]}
              onChange={(v) => onChange({ dmPolicy: v as 'open' | 'pairing' | 'allowlist' })}
            />
            <SelectField
              label={t('channel-dingtalk.groupPolicy')}
              value={account.groupPolicy}
              options={[
                { value: 'open', label: t('channel-dingtalk.groupPolicy.options.open') },
                { value: 'allowlist', label: t('channel-dingtalk.groupPolicy.options.allowlist') },
                { value: 'disabled', label: t('channel-dingtalk.groupPolicy.options.disabled') },
              ]}
              onChange={(v) => onChange({ groupPolicy: v as 'open' | 'allowlist' | 'disabled' })}
            />
            <div className="dct-field dct-field--full">
              <TextField
                label={t('channel-dingtalk.allowFrom')}
                hint={t('channel-dingtalk.allowFrom.description')}
                value={formatList(account.allowFrom)}
                onChange={(v) => onChange({ allowFrom: parseList(v) })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatList(list: Array<string | number> | undefined): string {
  if (!list || list.length === 0) return ''
  return list.join(', ')
}

function parseList(text: string): Array<string | number> {
  if (!text.trim()) return []
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // 数字直接转，否则保留字符串
      const n = Number(s)
      return Number.isFinite(n) && !/^\d+$/.test(s) ? s : s
    })
}

/**
 * 把 clientSecret 渲染成 ****（凭据字段永不显示明文）。
 * 用户输入新值时是字符串原样。
 */
function extractSecretDisplay(secret: Account['clientSecret']): string {
  if (!secret) return ''
  if (typeof secret === 'string') return '••••••••'
  return '••••••••'
}