import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sendToAppLibrary } from '@shared/layout/appLibrary'
import { APP_LIBRARY, appLocations } from '@shared/layout/locations'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import type { AppInfo, Device, Layout } from '@shared/types'
import { appError } from '@shared/errors'
import { Banner } from '../components/Banner'
import { PinIcon, SearchIcon } from '../components/icons'
import { Thumb } from '../components/Thumb'
import { ToolbarActions } from '../components/ToolbarSlot'
import { ApplySheet } from '../sheets/Apply'
import { ChangeCategorySheet } from '../sheets/ChangeCategory'
import { usePins } from '../state/pins'
import { useApps, useLayout } from '../state/queries'
import s from './apps.module.css'

interface Row extends AppInfo {
  location: string
}
type Key = 'name' | 'category' | 'developer' | 'location'

const COLUMNS: { key: Key; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'developer', label: 'Developer' },
  { key: 'location', label: 'Location' }
]
// Apps on a home screen page (or in a folder on one) can leave it; the dock's and the Library's can't.
const canLeave = (row: Row): boolean => row.location !== 'Dock' && row.location !== APP_LIBRARY
const NAMES_SHOWN = 6
const text = (row: Row, key: Key): string =>
  key === 'developer' ? (row.developer ?? 'Unknown') : row[key]

export function Apps({ device, onExport }: { device: Device; onExport: () => void }) {
  const apps = useApps(device.udid)
  const layout = useLayout(device.udid)
  const { pins, openMenu } = usePins()
  const qc = useQueryClient()
  const [changing, setChanging] = useState<AppInfo>()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  // What the sheet was opened for, kept apart from the live selection: the phone changes under it.
  const [sending, setSending] = useState<{ apps: Row[]; before: Layout } | null>(null)
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: 'name', desc: false })

  const rows = useMemo<Row[]>(() => {
    const where = layout.data ? appLocations(layout.data.layout) : new Map()
    return (apps.data?.apps ?? []).map((a) => ({
      ...a,
      location: where.get(a.bundleId)?.location ?? APP_LIBRARY
    }))
  }, [apps.data, layout.data])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q
      ? rows.filter(
          (r) => r.name.toLowerCase().includes(q) || (r.developer ?? '').toLowerCase().includes(q)
        )
      : rows
    const dir = sort.desc ? -1 : 1
    // numeric: "Page 2" sorts before "Page 10"
    return [...hits].sort(
      (a, b) =>
        dir * text(a, sort.key).localeCompare(text(b, sort.key), undefined, { numeric: true }) ||
        a.name.localeCompare(b.name)
    )
  }, [rows, query, sort])

  const toggle = (bundleId: string): void =>
    setPicked((now) => {
      const next = new Set(now)
      if (!next.delete(bundleId)) next.add(bundleId)
      return next
    })
  // Only what is still shown and still on a page counts, whatever the search or the phone did since.
  const chosen = rows.filter((r) => picked.has(r.bundleId) && canLeave(r))
  const before = layout.data?.layout

  if (apps.isError) {
    return (
      <div className={s.message}>
        <h2>Couldn’t read the app list</h2>
        <p>Make sure your {device.deviceClass} is unlocked and connected.</p>
        <button className="btn btn-primary btn-lg" onClick={() => void apps.refetch()}>
          Try Again
        </button>
      </div>
    )
  }
  if (apps.isPending) {
    return (
      <p className={s.status} role="status">
        Reading your apps…
      </p>
    )
  }

  const lookup = apps.data.lookup
  return (
    <div className={s.root}>
      <ToolbarActions>
        <button className="btn" onClick={onExport}>
          Export
        </button>
        <button
          className="btn"
          disabled={chosen.length === 0 || !before || device.state === 'unsupported-os'}
          onClick={() => before && setSending({ apps: chosen, before })}
        >
          Send to App Library{chosen.length > 0 ? ` (${chosen.length})` : ''}
        </button>
        <label className={s.search}>
          <SearchIcon size={14} />
          <input
            type="search"
            placeholder="Search apps"
            aria-label="Search apps"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </ToolbarActions>
      <div className={s.bar}>
        <span className="meta">
          {shown.length === rows.length
            ? `${rows.length} apps`
            : `${shown.length} of ${rows.length} apps`}
        </span>
      </div>
      {lookup === 'offline' && (
        <Banner severity="warning" title={appError('lookup-offline').title}>
          {appError('lookup-offline').message}
        </Banner>
      )}
      {lookup === 'running' && (
        <p className={s.looking} role="status">
          <span className="spin" aria-hidden="true" /> Looking up categories…
        </p>
      )}
      <div className={`${s.scroll} card`}>
        <table className={s.table}>
          <thead>
            <tr>
              <th aria-label="Select" />
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    className={s.sort}
                    onClick={() => setSort({ key, desc: sort.key === key && !sort.desc })}
                  >
                    {label}
                    {sort.key === key && <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.bundleId}
                title={r.bundleId}
                aria-selected={picked.has(r.bundleId)}
                onContextMenu={(e) =>
                  openMenu(e, r, [{ label: 'Change Category…', onSelect: () => setChanging(r) }])
                }
                // ⌘-click picks a row, like in Finder.
                onClick={(e) => (e.metaKey || e.ctrlKey) && canLeave(r) && toggle(r.bundleId)}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    disabled={!canLeave(r)}
                    checked={picked.has(r.bundleId) && canLeave(r)}
                    onChange={() => toggle(r.bundleId)}
                  />
                </td>
                <td>
                  <span className={s.name}>
                    <Thumb udid={device.udid} app={r} />
                    {r.name}
                    {pins.apps.includes(r.bundleId) && (
                      <span className={s.pinned} data-testid="pin-badge" title="Pinned">
                        <PinIcon size={12} />
                      </span>
                    )}
                  </span>
                </td>
                <td>
                  {r.category}
                  {r.categorySource === 'override' && (
                    <span className={s.edited} data-testid="override-dot" title="Changed by you" />
                  )}
                </td>
                <td className={r.developer ? undefined : s.unknown}>{text(r, 'developer')}</td>
                <td>{r.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="empty">
            <h2>No apps match “{query}”</h2>
            <p>Check the spelling, or search by developer.</p>
            <button className="btn" onClick={() => setQuery('')}>
              Clear Search
            </button>
          </div>
        )}
      </div>
      {changing && (
        <ChangeCategorySheet
          app={changing}
          known={rows.map((r) => r.category)}
          onClose={() => setChanging(undefined)}
        />
      )}
      {sending && (
        <ApplySheet
          title={`Send ${sending.apps.length} app${sending.apps.length === 1 ? '' : 's'} to the App Library?`}
          lines={[
            ...sending.apps.slice(0, NAMES_SHOWN).map((r) => r.name),
            ...(sending.apps.length > NAMES_SHOWN
              ? [`and ${sending.apps.length - NAMES_SHOWN} more`]
              : []),
            'They stay installed and can be found in the App Library.'
          ]}
          doneMessage={`Done! ${sending.apps.length} app${sending.apps.length === 1 ? ' is' : 's are'} in the App Library.`}
          udid={device.udid}
          run={() =>
            window.jiggle.apply.run({
              udid: device.udid,
              reason: 'Send to App Library',
              beforeSignature: layoutSignature(serialize(sending.before)),
              after: sendToAppLibrary(sending.before, new Set(sending.apps.map((r) => r.bundleId))),
              removedFromHomeScreen: sending.apps.map((r) => r.bundleId)
            })
          }
          onRefresh={() => void qc.invalidateQueries({ queryKey: ['layout'] })}
          onClose={() => {
            setSending(null)
            setPicked(new Set())
          }}
        />
      )}
    </div>
  )
}
