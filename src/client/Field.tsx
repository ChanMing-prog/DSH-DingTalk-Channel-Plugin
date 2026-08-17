/**
 * Field — shared field renderers (label + hint + input + invalid).
 *
 * Plain React 18, no DSH dependency.
 */

import { useCallback, type ReactNode } from 'react'

// =============================================================================
// useT — local locale resolver with fallback chain
// =============================================================================

export type Locale = Record<string, string>

/**
 * 默认 'zh' fallback dictionary — 与 DSH 服务端约定一致。
 * 客户端 fallback 链：active → zh → key.
 *
 * 只放最关键的 ~10 个 key 以做 fallback，避免把整个 zh 字典复制过来。
 * 完整翻译由 DSH 服务端 ctx.locale 提供。
 */
const ZH_FALLBACK: Record<string, string> = {
  'channel-dingtalk.title': '钉钉 Channel',
  'channel-dingtalk.enabled': '启用',
  'channel-dingtalk.clientId': 'Client ID',
  'channel-dingtalk.clientSecret': 'Client Secret',
  'channel-dingtalk.accounts.title': '多账号 / 多机器人',
  'channel-dingtalk.bindings.title': 'Agent 绑定',
  'channel-dingtalk.groups.title': '群特定配置',
  'channel-dingtalk.bridge.title': 'Bridge 行为',
  'channel-dingtalk.limits.title': '消息限制',
  'channel-dingtalk.status.allGood': '✅ 配置正确',
}

/**
 * 查找 key: active locale → zh fallback → key 本身.
 *
 * 与 DSH 服务端 (dsh-client-locale) 的查找链对齐。
 */
export function resolveT(
  active: Record<string, string>,
  key: string,
  params?: Record<string, string | number>,
): string {
  let v: string | undefined = active[key]
  if (v === undefined) {
    v = ZH_FALLBACK[key]
  }
  if (v === undefined) v = key
  if (params) {
    return v.replace(/\{(\w+)\}/g, (match, name) =>
      name in params ? String(params[name]) : match,
    )
  }
  return v
}

export function useT(locale: Locale) {
  return useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return resolveT(locale, key, params)
    },
    [locale],
  )
}

// =============================================================================
// Field wrappers
// =============================================================================

interface FieldShellProps {
  label: string
  hint?: string
  invalid?: string | null
  fullWidth?: boolean
  children: ReactNode
}

export function FieldShell({ label, hint, invalid, fullWidth, children }: FieldShellProps) {
  return (
    <div className={`dct-field ${fullWidth ? 'dct-field--full' : ''}`}>
      <label className="dct-field--label">{label}</label>
      {children}
      {invalid ? (
        <p className="dct-field--invalid">{invalid}</p>
      ) : hint ? (
        <p className="dct-field--hint">{hint}</p>
      ) : null}
    </div>
  )
}

// =============================================================================
// Text input
// =============================================================================

export function TextField({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
  type = 'text',
  disabled,
}: {
  id?: string
  label: string
  hint?: string
  value: string | number | undefined
  placeholder?: string
  onChange: (v: string) => void
  type?: 'text' | 'password' | 'number'
  disabled?: boolean
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <input
        id={id}
        className="dct-input"
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

// =============================================================================
// Textarea
// =============================================================================

export function TextAreaField({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
  rows = 3,
}: {
  id?: string
  label: string
  hint?: string
  value: string | undefined
  placeholder?: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea
        id={id}
        className="dct-textarea"
        value={value ?? ''}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

// =============================================================================
// Select
// =============================================================================

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T | undefined
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <select
        className="dct-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {value === undefined && <option value="" disabled>—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  )
}

// =============================================================================
// Checkbox
// =============================================================================

export function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean | undefined
  onChange: (v: boolean) => void
}) {
  return (
    <div className="dct-checkbox">
      <input
        type="checkbox"
        checked={checked ?? false}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <label onClick={() => onChange(!checked)}>{label}</label>
      {hint && <span className="dct-field--hint">— {hint}</span>}
    </div>
  )
}

// =============================================================================
// Section (collapsible wrapper)
// =============================================================================

export function Section({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string
  description?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="dct-section">
      <div
        className="dct-section--header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle()
        }}
      >
        <h3 className="dct-section--title">{title}</h3>
        <span className={`dct-section--chevron ${open ? 'open' : ''}`}>▶</span>
      </div>
      {open && (
        <>
          {description && <p className="dct-field--hint">{description}</p>}
          {children}
        </>
      )}
    </div>
  )
}

// =============================================================================
// Button
// =============================================================================

export function Button({
  onClick,
  children,
  variant = 'default',
  type = 'button',
}: {
  onClick: () => void
  children: ReactNode
  variant?: 'default' | 'primary' | 'danger'
  type?: 'button' | 'submit'
}) {
  const cls =
    variant === 'primary'
      ? 'dct-btn dct-btn--primary'
      : variant === 'danger'
        ? 'dct-btn dct-btn--danger'
        : 'dct-btn'
  return (
    <button type={type} className={cls} onClick={onClick}>
      {children}
    </button>
  )
}