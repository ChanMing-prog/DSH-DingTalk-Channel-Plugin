/**
 * ChannelCard — settings UI root card.
 *
 * 当 DSH 的 dsh-client-ui-settings-plugins 渲染 settings.plugins.tab →
 * settings.plugin.item 时，会拿到这个 ChannelCard 组件 props 并 mount。
 *
 * Props 由 DSH 注入（参考 dsh-client-ui-settings-plugins 的 slot contract）：
 *   - `config`: 当前 settings namespace 值（base + user merged）
 *   - `draft`: 用户编辑中的草稿（initially = config）
 *   - `onChange(draft)`: 字段变化回调
 *   - `status`: checkConfigStatus() 的结果
 *   - `locale`: locale 字典（zh-CN + en 由本仓库 typert 提供）
 *
 * 渲染策略：把所有简单字段（enabled / dmPolicy / 限制等）交给 schemastery 自动渲染，
 *           把复杂字段（accounts / bindings / groups）路由到自定义编辑器。
 */

import { useState } from 'react'
import { AccountsEditor } from './AccountsEditor.js'
import { BindingsEditor } from './BindingsEditor.js'
import { GroupsEditor } from './GroupsEditor.js'
import {
  Button,
  CheckboxField,
  Section,
  SelectField,
  TextAreaField,
  TextField,
  useT,
} from './Field.js'
import type { ChannelCardProps } from './types.js'
import type { DingtalkDraft } from './types.js'

export function ChannelCard(props: ChannelCardProps) {
  const t = useT(props.locale)
  const { config, draft, onChange, status } = props

  return (
    <div className="dct-card">
      <div className="dct-card--header">
        <div>
          <h2 className="dct-card--title">{t('channel-dingtalk.title')}</h2>
          <p className="dct-card--subtitle">{t('channel-dingtalk.description')}</p>
        </div>
        <StatusBanner status={status} t={t} />
      </div>

      <BasicFieldsSection config={config} draft={draft} onChange={onChange} t={t} />

      <AccountsEditor config={config} draft={draft} onChange={onChange} locale={props.locale} />
      <BindingsEditor config={config} draft={draft} onChange={onChange} locale={props.locale} />
      <GroupsEditor config={config} draft={draft} onChange={onChange} locale={props.locale} />

      <BridgeSection draft={draft} onChange={onChange} t={t} />
      <LimitsSection draft={draft} onChange={onChange} t={t} />

      <HelpFooter t={t} />
    </div>
  )
}

// =============================================================================
// Internal sections
// =============================================================================

function StatusBanner({
  status,
  t,
}: {
  status: ChannelCardProps['status']
  t: (k: string, p?: Record<string, string | number>) => string
}) {
  if (status.warnings.some((w) => w === 'credentials_not_configured')) {
    return <div className="dct-banner dct-banner--error">⚠️ {t('channel-dingtalk.status.notConfigured')}</div>
  }
  if (status.warnings.some((w) => w.startsWith('partial_config:'))) {
    const accounts = status.warnings
      .find((w) => w.startsWith('partial_config:'))
      ?.replace('partial_config:', '')
      .split(',')
    return (
      <div className="dct-banner dct-banner--warn">
        ⚠️ {t('channel-dingtalk.status.partialConfig')}
        {accounts && `: ${accounts.join(', ')}`}
      </div>
    )
  }
  if (status.warnings.some((w) => w.startsWith('bindings_missing:'))) {
    const missing = status.warnings
      .find((w) => w.startsWith('bindings_missing:'))
      ?.replace('bindings_missing:', '')
      .split(',')
    return (
      <div className="dct-banner dct-banner--error">
        ⚠️ {t('channel-dingtalk.status.bindingsMissing')} {missing?.join(', ')}
      </div>
    )
  }
  return (
    <div className="dct-banner dct-banner--ok">
      ✅ {t('channel-dingtalk.status.allGood')}
      {' · '}
      {t('channel-dingtalk.status.accountsCount', { count: status.enabledCount })}
    </div>
  )
}

function BasicFieldsSection({
  config,
  draft,
  onChange,
  t,
}: {
  config: ChannelCardProps['config']
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  t: (k: string, p?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(true)
  return (
    <Section
      title={t('channel-dingtalk.title')}
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CheckboxField
          label={t('channel-dingtalk.enabled')}
          hint={t('channel-dingtalk.enabled.description')}
          checked={draft.enabled ?? config.enabled ?? true}
          onChange={(v) => onChange({ ...draft, enabled: v })}
        />
        <TextField
          label={t('channel-dingtalk.defaultAccount')}
          hint={t('channel-dingtalk.defaultAccount.description')}
          value={draft.defaultAccount ?? config.defaultAccount ?? 'default'}
          onChange={(v) => onChange({ ...draft, defaultAccount: v })}
        />
        <TextField
          label={t('channel-dingtalk.clientId')}
          hint={t('channel-dingtalk.clientId.description')}
          value={draft.clientId ?? config.clientId}
          onChange={(v) => onChange({ ...draft, clientId: v })}
        />
        <TextField
          label={t('channel-dingtalk.clientSecret')}
          hint={t('channel-dingtalk.clientSecret.description')}
          value={typeof draft.clientSecret === 'string' ? draft.clientSecret : ''}
          type="password"
          onChange={(v) => onChange({ ...draft, clientSecret: v })}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <TextAreaField
            label={t('channel-dingtalk.systemPrompt')}
            hint={t('channel-dingtalk.systemPrompt.description')}
            value={draft.systemPrompt ?? config.systemPrompt}
            onChange={(v) => onChange({ ...draft, systemPrompt: v })}
          />
        </div>
        <CheckboxField
          label={t('channel-dingtalk.enableMediaUpload')}
          hint={t('channel-dingtalk.enableMediaUpload.description')}
          checked={draft.enableMediaUpload ?? config.enableMediaUpload ?? true}
          onChange={(v) => onChange({ ...draft, enableMediaUpload: v })}
        />
      </div>
    </Section>
  )
}

function BridgeSection({
  draft,
  onChange,
  t,
}: {
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  t: (k: string, p?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Section title={t('channel-dingtalk.bridge.title')} description={t('channel-dingtalk.bridge.description')} open={open} onToggle={() => setOpen(!open)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SelectField
          label={t('channel-dingtalk.inboxWakeup')}
          hint={t('channel-dingtalk.inboxWakeup.description')}
          value={draft.inboxWakeup ?? 'followup'}
          options={[
            { value: 'followup', label: t('channel-dingtalk.inboxWakeup.options.followup') },
            { value: 'steer', label: t('channel-dingtalk.inboxWakeup.options.steer') },
          ]}
          onChange={(v) => onChange({ ...draft, inboxWakeup: v as 'followup' | 'steer' })}
        />
        <TextField
          label={t('channel-dingtalk.streamTimeoutMs')}
          value={draft.streamTimeoutMs ?? 60000}
          type="number"
          onChange={(v) => onChange({ ...draft, streamTimeoutMs: Number(v) || 60000 })}
        />
        <TextField
          label={t('channel-dingtalk.jobsControllerName')}
          value={draft.jobsControllerName ?? 'dingtalk-stream'}
          onChange={(v) => onChange({ ...draft, jobsControllerName: v })}
        />
        <TextField
          label={t('channel-dingtalk.aiCardReuseMs')}
          hint={t('channel-dingtalk.aiCardReuseMs.description')}
          value={draft.aiCardReuseMs ?? 86_400_000}
          type="number"
          onChange={(v) => onChange({ ...draft, aiCardReuseMs: Number(v) || 86_400_000 })}
        />
        <CheckboxField
          label={t('channel-dingtalk.toolsOnly')}
          hint={t('channel-dingtalk.toolsOnly.description')}
          checked={draft.toolsOnly ?? false}
          onChange={(v) => onChange({ ...draft, toolsOnly: v })}
        />
      </div>
    </Section>
  )
}

function LimitsSection({
  draft,
  onChange,
  t,
}: {
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  t: (k: string, p?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Section title={t('channel-dingtalk.limits.title')} open={open} onToggle={() => setOpen(!open)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <TextField
          label={t('channel-dingtalk.historyLimit')}
          value={draft.historyLimit ?? 50}
          type="number"
          onChange={(v) => onChange({ ...draft, historyLimit: Number(v) || 50 })}
        />
        <TextField
          label={t('channel-dingtalk.textChunkLimit')}
          value={draft.textChunkLimit ?? 4000}
          type="number"
          onChange={(v) => onChange({ ...draft, textChunkLimit: Number(v) || 4000 })}
        />
        <TextField
          label={t('channel-dingtalk.mediaMaxMb')}
          value={draft.mediaMaxMb ?? 20}
          type="number"
          onChange={(v) => onChange({ ...draft, mediaMaxMb: Number(v) || 20 })}
        />
      </div>
    </Section>
  )
}

function HelpFooter({ t }: { t: (k: string) => string }) {
  return (
    <div className="dct-help">
      <p>📘 {t('channel-dingtalk.help.openPlatform')}</p>
      <p>💡 {t('channel-dingtalk.help.qrcodeAuth')}</p>
      <p>🔧 {t('channel-dingtalk.help.envVars')}</p>
      <p>🤖 {t('channel-dingtalk.help.multiAccount')}</p>
    </div>
  )
}