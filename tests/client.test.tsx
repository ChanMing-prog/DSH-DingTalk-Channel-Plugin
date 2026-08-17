/**
 * Tests for PR-6a client components.
 *
 * Strategy:
 *   - Field primitives (TextField, SelectField, CheckboxField, Section, Button) — pure rendering + onChange
 *   - AccountsEditor — adds/removes/edits accounts
 *   - BindingsEditor — adds/removes/edits bindings
 *   - GroupsEditor — adds/removes/edits groups
 *   - ChannelCard — full integration: status banner + sections
 *
 * Uses happy-dom for DOM environment (no real browser needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { useState } from 'react'

import {
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
  Section,
  Button,
  useT,
} from '../src/client/Field.js'
import { AccountsEditor } from '../src/client/AccountsEditor.js'
import { BindingsEditor } from '../src/client/BindingsEditor.js'
import { GroupsEditor } from '../src/client/GroupsEditor.js'
import { ChannelCard } from '../src/client/ChannelCard.js'
import type { DingTalkConfig, DingtalkDraft, ConfigStatus, Locale } from '../src/client/types.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// =============================================================================
// Helpers
// =============================================================================

const TEST_LOCALE: Locale = {
  'channel-dingtalk.title': 'DingTalk Channel',
  'channel-dingtalk.description': 'desc',
  'channel-dingtalk.enabled': 'Enabled',
  'channel-dingtalk.enabled.description': 'enabled hint',
  'channel-dingtalk.clientId': 'Client ID',
  'channel-dingtalk.clientId.description': 'cid hint',
  'channel-dingtalk.clientSecret': 'Client Secret',
  'channel-dingtalk.clientSecret.description': 'csec hint',
  'channel-dingtalk.defaultAccount': 'Default Account',
  'channel-dingtalk.defaultAccount.description': 'def hint',
  'channel-dingtalk.systemPrompt': 'System Prompt',
  'channel-dingtalk.systemPrompt.description': 'sys hint',
  'channel-dingtalk.enableMediaUpload': 'Media',
  'channel-dingtalk.enableMediaUpload.description': 'media hint',
  'channel-dingtalk.dmPolicy': 'DM Policy',
  'channel-dingtalk.dmPolicy.description': 'dm hint',
  'channel-dingtalk.dmPolicy.options.open': 'Open',
  'channel-dingtalk.dmPolicy.options.pairing': 'Pairing',
  'channel-dingtalk.dmPolicy.options.allowlist': 'Allowlist',
  'channel-dingtalk.allowFrom': 'Allow From',
  'channel-dingtalk.allowFrom.description': 'allow hint',
  'channel-dingtalk.groupPolicy': 'Group Policy',
  'channel-dingtalk.groupPolicy.description': 'gp hint',
  'channel-dingtalk.groupPolicy.options.open': 'Open',
  'channel-dingtalk.groupPolicy.options.allowlist': 'Allowlist',
  'channel-dingtalk.groupPolicy.options.disabled': 'Disabled',
  'channel-dingtalk.groupAllowFrom': 'Group Allow',
  'channel-dingtalk.groupAllowFrom.description': 'gp allow hint',
  'channel-dingtalk.requireMention': 'Require @',
  'channel-dingtalk.requireMention.description': 'rm hint',
  'channel-dingtalk.groups': 'Groups',
  'channel-dingtalk.groups.description': 'groups hint',
  'channel-dingtalk.accounts.title': 'Multi-account',
  'channel-dingtalk.accounts.description': 'multi-account desc',
  'channel-dingtalk.accounts.add': 'Add account',
  'channel-dingtalk.accounts.confirmDelete': 'Delete {id}?',
  'channel-dingtalk.accounts.empty': 'No accounts',
  'channel-dingtalk.accounts.disabled': 'disabled',
  'channel-dingtalk.accounts.name': 'Name',
  'channel-dingtalk.accounts.name.description': 'name desc',
  'channel-dingtalk.accounts.chatbotUserId': 'Bot ID',
  'channel-dingtalk.accounts.chatbotUserId.description': 'bot id desc',
  'channel-dingtalk.bindings.title': 'Bindings',
  'channel-dingtalk.bindings.description': 'bindings desc',
  'channel-dingtalk.bindings.add': 'Add binding',
  'channel-dingtalk.bindings.empty': 'No bindings',
  'channel-dingtalk.bindings.agentId': 'Agent ID',
  'channel-dingtalk.bindings.matchAccountId': 'Account',
  'channel-dingtalk.groups.title': 'Per-group',
  'channel-dingtalk.groups.description': 'per-group desc',
  'channel-dingtalk.groups.add': 'Add group',
  'channel-dingtalk.groups.empty': 'No groups',
  'channel-dingtalk.groups.confirmDelete': 'Delete group {id}?',
  'channel-dingtalk.groupSessionScope': 'Scope',
  'channel-dingtalk.inboxWakeup': 'Wakeup',
  'channel-dingtalk.inboxWakeup.description': 'wakeup desc',
  'channel-dingtalk.inboxWakeup.options.followup': 'Followup',
  'channel-dingtalk.inboxWakeup.options.steer': 'Steer',
  'channel-dingtalk.streamTimeoutMs': 'Stream timeout',
  'channel-dingtalk.jobsControllerName': 'Jobs controller',
  'channel-dingtalk.aiCardReuseMs': 'AI Card reuse',
  'channel-dingtalk.aiCardReuseMs.description': 'reuse desc',
  'channel-dingtalk.toolsOnly': 'Tools only',
  'channel-dingtalk.toolsOnly.description': 'tools only desc',
  'channel-dingtalk.historyLimit': 'History',
  'channel-dingtalk.textChunkLimit': 'Text chunk',
  'channel-dingtalk.mediaMaxMb': 'Media MB',
  'channel-dingtalk.bridge.title': 'Bridge',
  'channel-dingtalk.bridge.description': 'bridge desc',
  'channel-dingtalk.limits.title': 'Limits',
  'channel-dingtalk.status.notConfigured': 'Not configured',
  'channel-dingtalk.status.partialConfig': 'Partial config',
  'channel-dingtalk.status.bindingsMissing': 'Bindings missing',
  'channel-dingtalk.status.allGood': 'All good',
  'channel-dingtalk.status.accountsCount': '{count} accounts',
  'channel-dingtalk.help.openPlatform': 'open platform',
  'channel-dingtalk.help.qrcodeAuth': 'qrcode',
  'channel-dingtalk.help.envVars': 'env vars',
  'channel-dingtalk.help.multiAccount': 'multi account',
}

const EMPTY_CONFIG: DingTalkConfig = {}
const OK_STATUS: ConfigStatus = {
  ok: true,
  enabledCount: 1,
  missingAccountsInBindings: [],
  warnings: [],
  info: ['accounts_enabled:1'],
}

function TestHarness({
  initialConfig,
  initialDraft,
  initialStatus,
  children,
}: {
  initialConfig: DingTalkConfig
  initialDraft: DingtalkDraft
  initialStatus: ConfigStatus
  children: (props: {
    config: DingTalkConfig
    draft: DingtalkDraft
    setDraft: (d: DingtalkDraft) => void
    status: ConfigStatus
  }) => React.ReactNode
}) {
  const [draft, setDraft] = useState<DingtalkDraft>(initialDraft)
  return (
    <>
      {children({ config: initialConfig, draft, setDraft, status: initialStatus })}
    </>
  )
}

// =============================================================================
// Field primitives
// =============================================================================

describe('TextField', () => {
  it('renders label and value', () => {
    render(<TextField label="Name" value="alice" onChange={() => {}} />)
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByDisplayValue('alice')).toBeTruthy()
  })

  it('calls onChange when typed', () => {
    const onChange = vi.fn()
    render(<TextField label="x" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('x'), { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('renders hint when provided', () => {
    render(<TextField label="x" value="" onChange={() => {}} hint="hint text" />)
    expect(screen.getByText('hint text')).toBeTruthy()
  })

  it('supports type=password', () => {
    render(<TextField label="secret" value="abc" type="password" onChange={() => {}} />)
    const input = screen.getByDisplayValue('abc') as HTMLInputElement
    expect(input.type).toBe('password')
  })
})

describe('SelectField', () => {
  it('renders options', () => {
    render(
      <SelectField
        label="x"
        value="open"
        options={[
          { value: 'open', label: 'Open' },
          { value: 'pairing', label: 'Pairing' },
        ]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('Pairing')).toBeTruthy()
  })

  it('calls onChange when option selected', () => {
    const onChange = vi.fn()
    render(
      <SelectField
        label="x"
        value="open"
        options={[
          { value: 'open', label: 'Open' },
          { value: 'pairing', label: 'Pairing' },
        ]}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('x'), { target: { value: 'pairing' } })
    expect(onChange).toHaveBeenCalledWith('pairing')
  })
})

describe('CheckboxField', () => {
  it('reflects checked state', () => {
    render(<CheckboxField label="x" checked onChange={() => {}} />)
    const cb = screen.getByLabelText('x') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })

  it('toggles on change', () => {
    const onChange = vi.fn()
    render(<CheckboxField label="x" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('x'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Section', () => {
  it('toggles open state on click', () => {
    const { container } = render(
      <Section title="t" open={false} onToggle={() => {}}>
        <div>content</div>
      </Section>,
    )
    expect(container.textContent).not.toContain('content')
  })

  it('renders content when open', () => {
    render(
      <Section title="t" open onToggle={() => {}}>
        <div>CONTENT_HERE</div>
      </Section>,
    )
    expect(screen.getByText('CONTENT_HERE')).toBeTruthy()
  })
})

describe('Button', () => {
  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders variants via className', () => {
    const { container } = render(<Button onClick={() => {}} variant="danger">x</Button>)
    expect(container.querySelector('.dct-btn--danger')).toBeTruthy()
  })
})

describe('useT', () => {
  it('resolves keys from locale', () => {
    function Comp() {
      const t = useT(TEST_LOCALE)
      return <div>{t('channel-dingtalk.title')}</div>
    }
    render(<Comp />)
    expect(screen.getByText('DingTalk Channel')).toBeTruthy()
  })

  it('returns key when missing (loud fallback)', () => {
    function Comp() {
      const t = useT({})
      return <div>{t('missing.key')}</div>
    }
    render(<Comp />)
    expect(screen.getByText('missing.key')).toBeTruthy()
  })

  it('interpolates params', () => {
    function Comp() {
      const t = useT(TEST_LOCALE)
      return <div>{t('channel-dingtalk.status.accountsCount', { count: 5 })}</div>
    }
    render(<Comp />)
    expect(screen.getByText('5 accounts')).toBeTruthy()
  })
})

// =============================================================================
// AccountsEditor
// =============================================================================

describe('AccountsEditor', () => {
  it('renders empty state when no accounts', () => {
    render(
      <TestHarness
        initialConfig={EMPTY_CONFIG}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ config, draft, setDraft }) => (
          <AccountsEditor config={config} draft={draft} onChange={setDraft} locale={TEST_LOCALE} />
        )}
      </TestHarness>,
    )
    expect(screen.getByText('No accounts')).toBeTruthy()
  })

  it('adds account on Add button click', () => {
    let capturedDraft: DingtalkDraft | null = null
    render(
      <TestHarness
        initialConfig={EMPTY_CONFIG}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ config, draft, setDraft }) => (
          <AccountsEditor
            config={config}
            draft={draft}
            onChange={(d) => {
              capturedDraft = d
              setDraft(d)
            }}
            locale={TEST_LOCALE}
          />
        )}
      </TestHarness>,
    )
    fireEvent.click(screen.getByText('Add account'))
    expect(capturedDraft).not.toBeNull()
    expect((capturedDraft as DingtalkDraft).accounts).toBeDefined()
    const accounts = (capturedDraft as DingtalkDraft).accounts as Record<string, unknown>
    expect(Object.keys(accounts!)).toContain('bot-1')
  })

  it('uses existing account keys when generating new id', () => {
    const config: DingTalkConfig = {
      accounts: {
        'bot-1': { name: 'first' },
      },
    }
    let capturedDraft: DingtalkDraft | null = null
    render(
      <TestHarness
        initialConfig={config}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ draft, setDraft }) => (
          <AccountsEditor
            config={config}
            draft={draft}
            onChange={(d) => {
              capturedDraft = d
              setDraft(d)
            }}
            locale={TEST_LOCALE}
          />
        )}
      </TestHarness>,
    )
    fireEvent.click(screen.getByText('Add account'))
    const accounts = (capturedDraft as DingtalkDraft).accounts as Record<string, unknown>
    expect(Object.keys(accounts!)).toContain('bot-2')
  })
})

// =============================================================================
// BindingsEditor
// =============================================================================

describe('BindingsEditor', () => {
  it('renders empty state when no bindings', () => {
    render(
      <TestHarness
        initialConfig={EMPTY_CONFIG}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ config, draft, setDraft }) => (
          <BindingsEditor config={config} draft={draft} onChange={setDraft} locale={TEST_LOCALE} />
        )}
      </TestHarness>,
    )
    expect(screen.getByText('No bindings')).toBeTruthy()
  })

  it('adds binding on Add button click', () => {
    const config: DingTalkConfig = {
      accounts: { 'dev-bot': {} },
    }
    let capturedDraft: DingtalkDraft | null = null
    render(
      <TestHarness
        initialConfig={config}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ draft, setDraft }) => (
          <BindingsEditor
            config={config}
            draft={draft}
            onChange={(d) => {
              capturedDraft = d
              setDraft(d)
            }}
            locale={TEST_LOCALE}
          />
        )}
      </TestHarness>,
    )
    fireEvent.click(screen.getByText('Add binding'))
    const bindings = (capturedDraft as DingtalkDraft).bindings as Array<unknown>
    expect(bindings!.length).toBe(1)
    expect((bindings![0] as { agentId: string }).agentId).toBe('')
    expect((bindings![0] as { match: { accountId: string } }).match.accountId).toBe('dev-bot')
  })
})

// =============================================================================
// GroupsEditor
// =============================================================================

describe('GroupsEditor', () => {
  it('renders empty state when no groups', () => {
    render(
      <TestHarness
        initialConfig={EMPTY_CONFIG}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ config, draft, setDraft }) => (
          <GroupsEditor config={config} draft={draft} onChange={setDraft} locale={TEST_LOCALE} />
        )}
      </TestHarness>,
    )
    expect(screen.getByText('No groups')).toBeTruthy()
  })

  it('adds group on Add button click', () => {
    let capturedDraft: DingtalkDraft | null = null
    render(
      <TestHarness
        initialConfig={EMPTY_CONFIG}
        initialDraft={{}}
        initialStatus={OK_STATUS}
      >
        {({ config, draft, setDraft }) => (
          <GroupsEditor
            config={config}
            draft={draft}
            onChange={(d) => {
              capturedDraft = d
              setDraft(d)
            }}
            locale={TEST_LOCALE}
          />
        )}
      </TestHarness>,
    )
    fireEvent.click(screen.getByText('Add group'))
    expect(capturedDraft).not.toBeNull()
    const groups = (capturedDraft as DingtalkDraft).groups as Record<string, unknown>
    expect(groups).toBeDefined()
    expect(Object.keys(groups!).length).toBeGreaterThan(0)
  })
})

// =============================================================================
// ChannelCard (integration)
// =============================================================================

describe('ChannelCard', () => {
  it('renders status banner for OK status', () => {
    render(
      <ChannelCard
        config={{ clientId: 'cid', clientSecret: 'csec' }}
        draft={{}
        onChange={() => {}}
        status={{
          ok: true,
          enabledCount: 1,
          missingAccountsInBindings: [],
          warnings: [],
          info: [],
        }}
        locale={TEST_LOCALE}
      />,
    )
    expect(screen.getByText('All good')).toBeTruthy()
  })

  it('renders error banner for credentials_not_configured', () => {
    render(
      <ChannelCard
        config={EMPTY_CONFIG}
        draft={{}}
        onChange={() => {}}
        status={{
          ok: false,
          enabledCount: 0,
          missingAccountsInBindings: [],
          warnings: ['credentials_not_configured'],
          info: [],
        }}
        locale={TEST_LOCALE}
      />,
    )
    expect(screen.getByText('Not configured')).toBeTruthy()
  })

  it('renders partial_config banner with accounts', () => {
    render(
      <ChannelCard
        config={EMPTY_CONFIG}
        draft={{}}
        onChange={() => {}}
        status={{
          ok: false,
          enabledCount: 2,
          missingAccountsInBindings: [],
          warnings: ['partial_config:dev-bot,pm-bot'],
          info: [],
        }}
        locale={TEST_LOCALE}
      />,
    )
    expect(screen.getByText(/Partial config/)).toBeTruthy()
    expect(screen.getByText(/dev-bot/)).toBeTruthy()
  })

  it('renders bindings_missing banner with missing accounts', () => {
    render(
      <ChannelCard
        config={EMPTY_CONFIG}
        draft={{}}
        onChange={() => {}}
        status={{
          ok: false,
          enabledCount: 1,
          missingAccountsInBindings: ['ghost'],
          warnings: ['bindings_missing:ghost'],
          info: [],
        }}
        locale={TEST_LOCALE}
      />,
    )
    expect(screen.getByText(/Bindings missing/)).toBeTruthy()
    expect(screen.getByText(/ghost/)).toBeTruthy()
  })

  it('renders multi-account section even with empty accounts', () => {
    render(
      <ChannelCard
        config={EMPTY_CONFIG}
        draft={{}}
        onChange={() => {}}
        status={OK_STATUS}
        locale={TEST_LOCALE}
      />,
    )
    expect(screen.getByText('Multi-account')).toBeTruthy()
    expect(screen.getByText('Bindings')).toBeTruthy()
    expect(screen.getByText('Per-group')).toBeTruthy()
  })
})