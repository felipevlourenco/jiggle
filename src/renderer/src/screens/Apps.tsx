import { useMemo, useState } from 'react'
import { iconUrl } from '@shared/assets'
import { APP_LIBRARY, appLocations } from '@shared/layout/locations'
import type { AppInfo, Device } from '@shared/types'
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
const text = (row: Row, key: Key): string =>
  key === 'developer' ? (row.developer ?? 'Unknown') : row[key]

function Thumb({ udid, app }: { udid: string; app: AppInfo }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span className={`${s.thumb} ${s.letter}`} aria-hidden="true">
      {app.name.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img
      className={s.thumb}
      src={iconUrl(udid, app.bundleId)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

export function Apps({ device }: { device: Device }) {
  const apps = useApps(device.udid)
  const layout = useLayout(device.udid)
  const [query, setQuery] = useState('')
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

  if (apps.isError) {
    return (
      <div className={s.message}>
        <h2>Couldn’t read the app list</h2>
        <p>Make sure your {device.deviceClass} is unlocked and connected.</p>
        <button className="btn btn-primary" onClick={() => void apps.refetch()}>
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
      <div className={s.bar}>
        <input
          type="search"
          className={s.search}
          placeholder="Search apps"
          aria-label="Search apps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className={s.count}>
          {shown.length === rows.length
            ? `${rows.length} apps`
            : `${shown.length} of ${rows.length} apps`}
        </span>
      </div>
      {lookup === 'offline' && (
        <p className={s.banner} role="status">
          Can’t reach the App Store, so some categories show as Unknown. They’ll fill in next launch
          once you’re online.
        </p>
      )}
      {lookup === 'running' && (
        <p className={s.banner} role="status">
          Looking up categories…
        </p>
      )}
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
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
              <tr key={r.bundleId} title={r.bundleId}>
                <td>
                  <span className={s.name}>
                    <Thumb udid={device.udid} app={r} />
                    {r.name}
                  </span>
                </td>
                <td>{r.category}</td>
                <td className={r.developer ? undefined : s.unknown}>{text(r, 'developer')}</td>
                <td>{r.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className={s.status}>No apps match “{query}”.</p>}
      </div>
    </div>
  )
}
