/**
 * GroupsEditor — per-conversationId 群组特定配置.
 *
 * 视觉上是一个 conversationId → 策略 的网格表。
 */

import { Button, CheckboxField, SelectField, TextField, useT } from './Field.js'
import type { DingTalkConfig, DingtalkDraft, Locale } from './types.js'

type Group = NonNullable<DingTalkConfig['groups']>[string]

const DEFAULT_GROUP: Group = {
  enabled: true,
  requireMention: true,
  allowFrom: [],
  groupSessionScope: 'group',
  systemPrompt: '',
}

interface Props {
  config: DingTalkConfig
  draft: DingtalkDraft
  onChange: (d: DingtalkDraft) => void
  locale: Locale
}

export function GroupsEditor({ config, draft, onChange, locale }: Props) {
  const t = useT(locale)
  const groups = (draft.groups ?? config.groups ?? {}) as Record<string, Group>
  const entries = Object.entries(groups)

  const updateGroups = (next: Record<string, Group>) => {
    onChange({ ...draft, groups: next })
  }
  const addGroup = () => {
    let i = entries.length + 1
    let id = `cXXXXXX${i}`
    while (id in groups) {
      i++
      id = `cXXXXXX${i}`
    }
    updateGroups({ ...groups, [id]: { ...DEFAULT_GROUP } })
  }
  const removeGroup = (id: string) => {
    if (!confirm(t('channel-dingtalk.groups.confirmDelete', { id }))) return
    const { [id]: _removed, ...rest } = groups
    updateGroups(rest)
  }
  const updateGroup = (id: string, patch: Partial<Group>) => {
    updateGroups({ ...groups, [id]: { ...(groups[id] ?? DEFAULT_GROUP), ...patch } })
  }

  return (
    <div className="dct-section">
      <h3 className="dct-section--title">{t('channel-dingtalk.groups.title')}</h3>
      <p className="dct-field--hint">{t('channel-dingtalk.groups.description')}</p>

      <div className="dct-groups">
        {entries.length === 0 && <p className="dct-field--hint">{t('channel-dingtalk.groups.empty')}</p>}
        {entries.map(([id, g]) => (
          <div key={id} className="dct-group">
            <TextField
              label="conversationId"
              value={id}
              disabled
              onChange={() => {}}
            />
            <SelectField
              label={t('channel-dingtalk.groupSessionScope')}
              value={g.groupSessionScope}
              options={[
                { value: 'group', label: 'group' },
                { value: 'group_sender', label: 'group_sender' },
              ]}
              onChange={(v) => updateGroup(id, { groupSessionScope: v as 'group' | 'group_sender' })}
            />
            <CheckboxField
              label={t('channel-dingtalk.requireMention')}
              checked={g.requireMention}
              onChange={(v) => updateGroup(id, { requireMention: v })}
            />
            <Button onClick={() => removeGroup(id)} variant="danger">×</Button>
          </div>
        ))}
      </div>

      <Button onClick={addGroup} variant="primary">
        + { t('channel-dingtalk.groups.add') }
      </Button>
    </div>
  )
}