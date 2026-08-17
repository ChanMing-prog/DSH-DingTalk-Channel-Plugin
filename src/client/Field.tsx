/**
 * Field — shared field renderers (label + hint + input + invalid).
 *
 * Plain React 18, no DSH dependency.
 */

import { useCallback, type ReactNode } from 'react'

// =============================================================================
// useT — local locale resolver
// =============================================================================

export type Locale = Record<string, string>

export function useT(locale: Locale) {
  return useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let v = locale[key]
      if (v === undefined) {
        // 缺失时回退到 key 本身（settings UI 应尽早暴露缺失翻译）
        v = key
      }
      if (params) {
        for (const [k, val] of Object.entries(params)) {
          v = v.replace(`{${k}}`, String(val))
        }
      }
      return v
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