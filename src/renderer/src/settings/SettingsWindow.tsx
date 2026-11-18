import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Settings } from '@shared/types'
import { useEffect } from 'react'
import { GearIcon, ShieldIcon, ShieldOutline } from '../components/icons'
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
            {t === 'general' ? <GearIcon size={20} /> : <ShieldOutline size={20} />}
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
    <div className={s.form}>
      <label className={s.fl} htmlFor="theme">
        Appearance:
      </label>
      <div>
        <select
          id="theme"
          className="field"
          value={settings.theme}
          onChange={(e) => save({ theme: e.target.value as Settings['theme'] })}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <label className={s.fl} htmlFor="region">
        App Store region:
      </label>
      <div>
        <input
          id="region"
          className={`field ${s.region}`}
          value={region}
          maxLength={2}
          aria-invalid={!valid}
          aria-describedby="region-help"
          onChange={(e) => setRegion(e.target.value)}
          onBlur={() =>
            valid ? save({ storefront: region.toLowerCase() }) : setRegion(settings.storefront)
          }
        />
      </div>
      <span id="region-help" className={s.hint}>
        Two letters, like nl or us. Categories and developers are looked up for this region.
      </span>
      <label className={s.fl} htmlFor="retention">
        Automatic backups to keep:
      </label>
      <div className={s.inline}>
        <select
          id="retention"
          className="field"
          value={settings.backupRetention}
          onChange={(e) => save({ backupRetention: Number(e.target.value) })}
        >
          {choices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="meta">per device</span>
      </div>
    </div>
  )
}

function Privacy({ settings, save }: { settings: Settings; save: (p: Partial<Settings>) => void }) {
  const clear = useMutation({ mutationFn: () => window.jiggle.settings.clearCache() })
  return (
    <div className={s.privacy}>
      <div className="assure">
        <ShieldIcon size={22} />
        <div className={s.stack}>
          <strong>Everything stays on this Mac.</strong>
          <span>
            Jiggle only contacts Apple’s App Store for categories, and GitHub for updates.
          </span>
        </div>
      </div>
      <div className={s.option}>
        <label className="sw">
          <input
            type="checkbox"
            checked={settings.categoryLookupEnabled}
            onChange={(e) => save({ categoryLookupEnabled: e.target.checked })}
          />
          <strong>Look up categories online</strong>
        </label>
        <p className={s.help}>
          Jiggle asks Apple’s public App Store service for each app’s category and developer. Only
          app identifiers are sent, never your layout or your name. With this off, Jiggle makes no
          network requests for categories and they show as Unknown.
        </p>
      </div>
      <div className={s.option}>
        <label className="sw">
          <input
            type="checkbox"
            checked={settings.updateCheckEnabled}
            onChange={(e) => save({ updateCheckEnabled: e.target.checked })}
          />
          <strong>Check for updates at launch</strong>
        </label>
        <p className={s.help}>
          Jiggle asks GitHub whether a newer version exists and sends nothing about you or your
          phone. With both options off, Jiggle makes no network requests at all. Jiggle &gt; Check
          for Updates… still works when you choose it.
        </p>
      </div>
      <div className={`${s.option} ${s.split}`}>
        <div className={s.stack}>
          <strong>Cache</strong>
          <span className={s.help} role="status">
            {clear.isSuccess ? 'Cleared.' : 'Forgets looked-up categories and app icons.'}
          </span>
        </div>
        <button className="btn" disabled={clear.isPending} onClick={() => clear.mutate()}>
          Clear Cache
        </button>
      </div>
    </div>
  )
}
