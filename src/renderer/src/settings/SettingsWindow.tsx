import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Settings } from '@shared/types'
import { useEffect } from 'react'
import s from './settings.module.css'

const BACKUP_CHOICES = [10, 25, 50, 100]
const REGION = /^[a-z]{2}$/

type Tab = 'general' | 'privacy'

// ⌘, : a separate window with General and Privacy.
export function SettingsWindow() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => window.jiggle.settings.get() })
  useEffect(
    () => window.jiggle.settings.onChanged((next) => qc.setQueryData(['settings'], next)),
    [qc]
  )
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => window.jiggle.settings.set(patch),
    onSuccess: (next) => qc.setQueryData(['settings'], next)
  })
  const [tab, setTab] = useState<Tab>('general')

  if (!data) return null
  return (
    <div className={s.root}>
      <div className={s.tabs} role="tablist" aria-label="Settings">
        {(['general', 'privacy'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={s.tab}
            onClick={() => setTab(t)}
          >
            {t === 'general' ? 'General' : 'Privacy'}
          </button>
        ))}
      </div>
      {tab === 'general' ? (
        <General settings={data} save={(p) => save.mutate(p)} />
      ) : (
        <Privacy settings={data} save={(p) => save.mutate(p)} />
      )}
    </div>
  )
}

function General({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const [region, setRegion] = useState(settings.storefront)
  const valid = REGION.test(region.toLowerCase())
  const choices = BACKUP_CHOICES.includes(settings.backupRetention)
    ? BACKUP_CHOICES
    : [...BACKUP_CHOICES, settings.backupRetention].sort((a, b) => a - b)
  return (
    <div className={s.panel}>
      <label className={s.row}>
        <span>Appearance</span>
        <select
          value={settings.theme}
          onChange={(e) => save({ theme: e.target.value as Settings['theme'] })}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className={s.row}>
        <span>App Store region</span>
        <input
          className={s.region}
          value={region}
          maxLength={2}
          aria-invalid={!valid}
          aria-describedby="region-help"
          onChange={(e) => setRegion(e.target.value)}
          onBlur={() =>
            valid ? save({ storefront: region.toLowerCase() }) : setRegion(settings.storefront)
          }
        />
      </label>
      <p id="region-help" className={s.help}>
        Two letters, like nl or us. Categories and developers are looked up for this region.
      </p>
      <label className={s.row}>
        <span>Automatic backups to keep</span>
        <select
          value={settings.backupRetention}
          onChange={(e) => save({ backupRetention: Number(e.target.value) })}
        >
          {choices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function Privacy({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const clear = useMutation({ mutationFn: () => window.jiggle.settings.clearCache() })
  return (
    <div className={s.panel}>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={settings.categoryLookupEnabled}
          onChange={(e) => save({ categoryLookupEnabled: e.target.checked })}
        />
        <span>Look up categories online</span>
      </label>
      <p className={s.help}>
        Jiggle asks Apple’s public App Store service for each app’s category and developer. Only app
        identifiers are sent, never your layout or your name. With this off, Jiggle makes no network
        requests at all and categories show as Unknown.
      </p>
      <div className={s.row}>
        <button className="btn" disabled={clear.isPending} onClick={() => clear.mutate()}>
          Clear Cache
        </button>
        <span className={s.help} role="status">
          {clear.isSuccess ? 'Cleared.' : 'Forgets looked-up categories and app icons.'}
        </span>
      </div>
    </div>
  )
}
