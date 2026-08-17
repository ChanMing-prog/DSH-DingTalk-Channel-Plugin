/**
 * BindingsEditor — Agent ↔ 账号 绑定关系可视化编辑.
 *
 * 视觉上是一行行 "agentId → accountId" 配对，每行可编辑可重排。
 */

import { Button, TextField, useT } from './Field.js'
import type { DingTalkConfig, DingtalkDraft, Locale } from './types.js'

interface Props {
  config: DingTalkConfig
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  locale: Locale
}

export function BindingsEditor({ config, draft, onChange, locale }: Props) {
  const t = useT(locale)
  const bindings = (draft.bindings ?? config.bindings ?? []) as DingTalkConfig['bindings']
  const accounts = Object.keys(draft.accounts ?? config.accounts ?? {})

  const updateBindings = (next: DingTalkConfig['bindings']) => {
    onChange({ ...draft, bindings: next })
  }
  const updateBinding = (idx: number, patch: Partial<NonNullable<DingTalkConfig['bindings']>[number]>) => {
    const next = (bindings ?? []).map((b, i) => (i === idx ? { ...b, ...patch } : b))
    updateBindings(next)
  }
  const addBinding = () => {
    const next = [...(bindings ?? []), { agentId: '', match: { channel: 'dingtalk-connector' as const, accountId: accounts[0] ?? 'default' } }]
    updateBindings(next)
  }
  const removeBinding = (idx: number) => {
    const next = (bindings ?? []).filter((_, i) => i !== idx)
    updateBindings(next.length > 0 ? next : undefined)
  }

  return (
    <div className="dct-section">
      <h3 className="dct-section--title">{t('channel-dingtalk.bindings.title')}</h3>
      <p className="dct-field--hint">{t('channel-dingtalk.bindings.description')}</p>

      <div className="dct-bindings">
        {(bindings ?? []).length === 0 && (
          <p className="dct-field--hint">{t('channel-dingtalk.bindings.empty')}</p>
        )}
        {(bindings ?? []).map((b, i) => (
          <div key={i} className="dct-binding">
            <TextField
              label={t('channel-dingtalk.bindings.agentId')}
              value={b.agentId}
              onChange={(v) => updateBinding(i, { agentId: v })}
            />
            <span className="dct-binding--arrow">→</span>
            <AccountSelect
              value={b.match.accountId}
              accounts={accounts}
              onChange={(v) => updateBinding(i, { match: { channel: 'dingtalk-connector', accountId: v } })}
              locale={locale}
            />
            <Button onClick={() => removeBinding(i)} variant="danger">×</Button>
          </div>
        ))}
      </div>

      <Button onClick={addBinding} variant="primary" >
        + {t('channel-dingtalk.bindings.add')}
      </Button>
    </div>
  )
}

function AccountSelect({
  value,
  accounts,
  onChange,
  locale,
}: {
  value: string
  accounts: string[]
  onChange: (v: string) => void
  locale: Locale
}) {
  const t = useT(locale)
  const allAccounts = ['default', ...accounts.filter((a) => a !== 'default')]
  return (
    <div className="dct-field">
      <label className="dct-field--label">{t('channel-dingtalk.bindings.matchAccountId')}</label>
      <select
        className="dct-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allAccounts.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  )
}