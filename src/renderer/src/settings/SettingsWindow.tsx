import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Settings } from '@shared/types'
import { useEffect } from 'react'
import { AppsIcon, GearIcon, ShieldIcon, ShieldOutline, WifiIcon } from '../components/icons'
import s from './settings.module.css'

const BACKUP_CHOICES = [10, 25, 50, 100]
const REGION = /^[a-z]{2}$/

type Tab = 'general' | 'categories' | 'connection' | 'privacy'
const TABS: { tab: Tab; label: string; icon: typeof GearIcon }[] = [
  { tab: 'general', label: 'General', icon: GearIcon },
  { tab: 'categories', label: 'Categories', icon: AppsIcon },
  { tab: 'connection', label: 'Connection', icon: WifiIcon },
  { tab: 'privacy', label: 'Privacy', icon: ShieldOutline }
]

// ⌘, : a separate window with General, Categories and Privacy.
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
        {TABS.map(({ tab: t, label, icon: Icon }) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={s.tab}
            onClick={() => setTab(t)}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'general' && <General settings={data} save={(p) => save.mutate(p)} />}
      {tab === 'categories' && <Categories />}
      {tab === 'connection' && <Connection settings={data} save={(p) => save.mutate(p)} />}
      {tab === 'privacy' && <Privacy settings={data} save={(p) => save.mutate(p)} />}
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

// Wi‑Fi: Jiggle can find a phone through the Mac's own Wi‑Fi sync once Finder has been told to show it.
function Connection({
  settings,
  save
}: {
  settings: Settings
  save: (p: Partial<Settings>) => void
}) {
  const qc = useQueryClient()
  const { data: devices } = useQuery({
    queryKey: ['wifi-devices'],
    queryFn: () => window.jiggle.device.list()
  })
  useEffect(
    () =>
      window.jiggle.device.onChanged(
        () => void qc.invalidateQueries({ queryKey: ['wifi-devices'] })
      ),
    [qc]
  )
  // The engine takes a moment to look after the switch is turned on.
  const [looking, setLooking] = useState(false)
  useEffect(() => {
    if (!looking) return
    const timer = window.setTimeout(() => setLooking(false), 2500)
    return () => window.clearTimeout(timer)
  }, [looking])
  const found = (devices ?? []).filter((d) => d.connection === 'wifi')
  return (
    <div className={s.privacy}>
      <div className={s.option}>
        <label className="sw">
          <input
            type="checkbox"
            checked={settings.wifiEnabled}
            onChange={(e) => {
              setLooking(e.target.checked)
              save({ wifiEnabled: e.target.checked })
            }}
          />
          <strong>Connect over Wi‑Fi</strong>
        </label>
        <p className={s.help}>
          Jiggle uses your Mac’s own Wi‑Fi sync, so the phone must be set up once with a cable.
        </p>
        <ol className={s.steps}>
          <li>Connect with a cable.</li>
          <li>In Finder, select your iPhone or iPad.</li>
          <li>Turn on “Show this iPhone when on Wi‑Fi”, then click Apply.</li>
        </ol>
      </div>
      {settings.wifiEnabled && (
        <p className={found.length > 0 ? s.found : s.none} role="status">
          {looking && found.length === 0 ? (
            <>
              <span className="spin" aria-hidden="true" /> Looking for devices…
            </>
          ) : found.length > 0 ? (
            `${found.map((d) => d.name).join(' and ')} ${found.length === 1 ? 'is' : 'are'} available over Wi‑Fi`
          ) : (
            'No Wi‑Fi devices found'
          )}
        </p>
      )}
    </div>
  )
}

// The categories the person changed in Apps, each with a way back to the App Store's.
function Categories() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['overrides'],
    queryFn: () => window.jiggle.apps.overrides()
  })
  useEffect(
    () =>
      window.jiggle.apps.onChanged(() => void qc.invalidateQueries({ queryKey: ['overrides'] })),
    [qc]
  )
  if (!data) return null
  if (data.length === 0) {
    return (
      <p className={s.empty}>
        No category overrides. Right‑click an app in Apps to change its category.
      </p>
    )
  }
  return (
    <ul className={s.overrides}>
      {data.map((o) => (
        <li key={o.bundleId}>
          <span>
            <strong>{o.name}</strong> → {o.category}
          </span>
          <button
            className="btn btn-sm"
            aria-label={`Reset ${o.name}`}
            onClick={() => void window.jiggle.apps.resetCategory(o.bundleId)}
          >
            Reset
          </button>
        </li>
      ))}
    </ul>
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
