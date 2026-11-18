import { useMemo, useState } from 'react'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { SnapshotEntry, SnapshotSummary } from '@shared/types'
import { PageGrid } from '../components/PageGrid'
import { PhoneFrame } from '../components/PhoneFrame'
import { ApplySheet } from '../sheets/Apply'
import { useBackUp, useSnapshots } from '../state/queries'
import s from './history.module.css'

const THUMB_ZOOM = 0.13
const grid = gridFor('iPhone')

const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const when = (iso: string, today: boolean): string => {
  const d = new Date(iso)
  return today
    ? time(d)
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time(d)}`
}
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const isToday = (iso: string): boolean => new Date(iso).toDateString() === new Date().toDateString()

function Thumbnail({ snapshot }: { snapshot: SnapshotSummary }) {
  const items = useMemo(
    () => normalize([[], snapshot.page1], grid).pages[0] ?? [],
    [snapshot.page1]
  )
  return (
    <div className={s.thumb} aria-hidden="true">
      <PhoneFrame zoom={THUMB_ZOOM}>
        <PageGrid items={items} grid={grid} udid={snapshot.udid} />
      </PhoneFrame>
    </div>
  )
}

function Row({
  entry,
  today,
  onRestore
}: {
  entry: SnapshotEntry
  today: boolean
  onRestore?: () => void // undefined: no phone to restore to
}) {
  if (entry.damaged) {
    return (
      <li className={`${s.row} ${s.damaged}`}>
        <span aria-hidden="true">⚠︎</span>
        <div>
          <strong>Damaged backup</strong>
          <div className={s.meta}>
            {when(entry.createdAt, today)} · This backup file is damaged and can’t be restored.
          </div>
        </div>
      </li>
    )
  }
  return (
    <li className={s.row}>
      <Thumbnail snapshot={entry} />
      <div>
        <strong>{entry.name ?? entry.reason ?? 'Backup'}</strong>
        <div className={s.meta}>
          {when(entry.createdAt, today)} · {plural(entry.appCount, 'app')} ·{' '}
          {plural(entry.pageCount, 'page')}
        </div>
      </div>
      <button className={`btn ${s.restore}`} disabled={!onRestore} onClick={onRestore}>
        Restore
      </button>
    </li>
  )
}

export function History({
  udid,
  canBackUp,
  canRestore
}: {
  udid: string | undefined
  canBackUp: boolean // a phone we can read
  canRestore: boolean // a phone we may write to (not read-only)
}) {
  const { data, isPending, isError, refetch } = useSnapshots(udid)
  const backUp = useBackUp()
  const [restoring, setRestoring] = useState<SnapshotSummary>()
  const button = (
    <button
      className="btn btn-primary"
      disabled={!canBackUp || !udid || backUp.isPending}
      onClick={() => udid && backUp.mutate(udid)}
    >
      {backUp.isPending ? 'Backing up…' : 'Back Up Now'}
    </button>
  )

  if (isError) {
    return (
      <div className={s.message} role="alert">
        <h2>Couldn’t read your backups</h2>
        <button className="btn btn-primary" onClick={() => void refetch()}>
          Try Again
        </button>
      </div>
    )
  }
  if (isPending) {
    return (
      <p className={s.status} role="status">
        Loading backups…
      </p>
    )
  }
  if (data.length === 0) {
    return (
      <div className={s.message}>
        <h2>No backups yet</h2>
        <p>Jiggle backs up automatically before every change.</p>
        {button}
      </div>
    )
  }

  const today = data.filter((e) => isToday(e.createdAt))
  const earlier = data.filter((e) => !isToday(e.createdAt))
  const group = (title: string, entries: SnapshotEntry[], isTodayGroup: boolean) =>
    entries.length > 0 && (
      <section>
        <h2 className={s.heading}>{title}</h2>
        <ul className={s.list}>
          {entries.map((e) => (
            <Row
              key={e.id}
              entry={e}
              today={isTodayGroup}
              onRestore={canRestore && !e.damaged ? () => setRestoring(e) : undefined}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className={s.root}>
      <div className={s.top}>
        <h2 className={s.title}>Automatic backups</h2>
        {button}
      </div>
      {!canBackUp && (
        <p className={s.banner}>
          No iPhone connected. You can look at your backups, not change anything.
        </p>
      )}
      {group('Today', today, true)}
      {group('Earlier', earlier, false)}
      <p className={s.footer}>Jiggle keeps the last 50 automatic backups for each device.</p>
      {restoring && (
        <ApplySheet
          title={`Restore “${restoring.name ?? restoring.reason ?? 'backup'}”?`}
          lines={[
            `Back to ${when(restoring.createdAt, isToday(restoring.createdAt))}: ${plural(restoring.appCount, 'app')} on ${plural(restoring.pageCount, 'page')}`
          ]}
          confirmLabel="Restore"
          doneMessage="Restored. Your iPhone is back as it was."
          udid={restoring.udid}
          run={() => window.jiggle.apply.restore(restoring.udid, restoring.id)}
          onClose={() => setRestoring(undefined)}
        />
      )}
    </div>
  )
}
