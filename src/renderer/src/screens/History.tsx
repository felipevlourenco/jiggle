import { useState } from 'react'
import type { LayoutFileResult, SnapshotEntry, SnapshotSummary } from '@shared/types'
import { BackUpIcon, HistoryIcon, WarnIcon } from '../components/icons'
import { SnapshotThumb } from '../components/LayoutThumb'
import { Banner } from '../components/Banner'
import { ToolbarActions } from '../components/ToolbarSlot'
import { ApplySheet } from '../sheets/Apply'
import { DeleteLayoutSheet, RenameLayoutSheet, savedNames } from '../sheets/SaveLayout'
import { useBackUp, useSnapshots } from '../state/queries'
import s from './history.module.css'

const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const when = (iso: string, today: boolean): string => {
  const d = new Date(iso)
  return today
    ? time(d)
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time(d)}`
}
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const day = (iso: string): string =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
const isSaved = (e: SnapshotEntry): e is SnapshotSummary => !e.damaged && e.kind === 'saved-layout'
const isToday = (iso: string): boolean => new Date(iso).toDateString() === new Date().toDateString()

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
        <span className={`${s.badge} ${s.badgeBad}`} aria-hidden="true">
          <WarnIcon size={15} />
        </span>
        <div className={s.grow}>
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
      <span className={s.badge} aria-hidden="true">
        <HistoryIcon size={15} />
      </span>
      <div className={s.grow}>
        <strong>{entry.name ?? entry.reason ?? 'Backup'}</strong>
        <div className={s.meta}>
          {when(entry.createdAt, today)} · {plural(entry.appCount, 'app')} ·{' '}
          {plural(entry.pageCount, 'page')}
        </div>
      </div>
      <button className="btn" disabled={!onRestore} onClick={onRestore}>
        Restore
      </button>
    </li>
  )
}

// A saved layout: a small page 1, its name and what you can do with it.
function SavedCard({
  layout,
  onSwitch,
  onRename,
  onExport,
  onDelete
}: {
  layout: SnapshotSummary
  onSwitch?: () => void // undefined: no phone to switch
  onRename: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const name = layout.name ?? 'Layout'
  return (
    <li className={`${s.card} card`}>
      <SnapshotThumb snapshot={layout} />
      <div className={s.cardBody}>
        <strong className="headline">{name}</strong>
        <div className={s.meta}>
          {plural(layout.appCount, 'app')} · saved {day(layout.createdAt)}
        </div>
        <div className={s.actions}>
          <button
            className="btn btn-primary btn-sm"
            aria-label={`Switch to ${name}`}
            disabled={!onSwitch}
            onClick={onSwitch}
          >
            Switch
          </button>
          <button className="btn btn-sm" aria-label={`Rename ${name}`} onClick={onRename}>
            Rename
          </button>
          <button className="btn btn-sm" aria-label={`Export ${name}`} onClick={onExport}>
            Export
          </button>
          <button className="btn btn-sm" aria-label={`Delete ${name}`} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

export function History({
  udid,
  deviceName,
  canBackUp,
  canRestore,
  onSaveLayout
}: {
  udid: string | undefined
  deviceName?: string
  canBackUp: boolean // a phone we can read
  canRestore: boolean // a phone we may write to (not read-only)
  onSaveLayout: () => void // opens the Save Layout sheet
}) {
  const { data, isPending, isError, refetch } = useSnapshots(udid)
  const backUp = useBackUp()
  const [restoring, setRestoring] = useState<SnapshotSummary>()
  const [switching, setSwitching] = useState<SnapshotSummary>()
  const [renaming, setRenaming] = useState<SnapshotSummary>()
  const [deleting, setDeleting] = useState<SnapshotSummary>()
  const [fileError, setFileError] = useState<string>()
  // A closed dialog is not an error; success is toasted by main.
  const fileAction = (run: () => Promise<LayoutFileResult>) =>
    void run().then((r) => setFileError(!r.ok && !r.canceled ? r.message : undefined))
  const button = (large: boolean) => (
    <button
      className={`btn btn-primary${large ? ' btn-lg' : ''}`}
      disabled={!canBackUp || !udid || backUp.isPending}
      onClick={() => udid && backUp.mutate(udid)}
    >
      {!large && <BackUpIcon size={14} />}
      {backUp.isPending ? 'Backing up…' : 'Back Up Now'}
    </button>
  )

  if (isError) {
    return (
      <div className={s.message} role="alert">
        <h2>Couldn’t read your backups</h2>
        <button className="btn btn-primary btn-lg" onClick={() => void refetch()}>
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
  const saveButton = (
    <button className="btn" disabled={!canBackUp || !udid} onClick={onSaveLayout}>
      Save Current Layout…
    </button>
  )
  const importButton = (
    <button
      className="btn"
      disabled={!udid}
      onClick={() => udid && fileAction(() => window.jiggle.snapshots.importLayout(udid))}
    >
      Import Layout…
    </button>
  )
  const fileBanner = fileError && <Banner severity="error">{fileError}</Banner>
  if (data.length === 0) {
    return (
      <div className={s.message}>
        <ToolbarActions>
          {saveButton}
          {importButton}
        </ToolbarActions>
        {fileBanner}
        <h2>No backups yet</h2>
        <p>Jiggle backs up automatically before every change.</p>
        {button(true)}
      </div>
    )
  }

  const saved = data.filter(isSaved)
  const backups = data.filter((e) => !isSaved(e))
  const today = backups.filter((e) => isToday(e.createdAt))
  const earlier = backups.filter((e) => !isToday(e.createdAt))
  const group = (title: string, entries: SnapshotEntry[], isTodayGroup: boolean) =>
    entries.length > 0 && (
      <section className={`${s.group} card`}>
        <h3 className={s.heading}>{title}</h3>
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
      <ToolbarActions>
        {button(false)}
        {saveButton}
        {importButton}
      </ToolbarActions>
      {fileBanner}
      {!canBackUp && (
        <Banner>
          No iPhone or iPad connected. You can look at your backups, not change anything.
        </Banner>
      )}
      {saved.length > 0 && (
        <>
          <h2 className="headline">Saved layouts</h2>
          <ul className={s.cards}>
            {saved.map((l) => (
              <SavedCard
                key={l.id}
                layout={l}
                onSwitch={canRestore ? () => setSwitching(l) : undefined}
                onRename={() => setRenaming(l)}
                onExport={() =>
                  fileAction(() => window.jiggle.snapshots.exportLayout(l.udid, l.id))
                }
                onDelete={() => setDeleting(l)}
              />
            ))}
          </ul>
        </>
      )}
      <h2 className="headline">Automatic backups</h2>
      {backups.length === 0 && <p className={s.footer}>None yet.</p>}
      {group('Today', today, true)}
      {group('Earlier', earlier, false)}
      <p className={s.footer}>Jiggle keeps the last 50 automatic backups for each device.</p>
      {switching && (
        <ApplySheet
          title={`Switch to “${switching.name}”?`}
          lines={[
            `${plural(switching.appCount, 'app')} on ${plural(switching.pageCount, 'page')}, as saved ${day(switching.createdAt)}`,
            'Apps installed since are added at the end.'
          ]}
          confirmLabel="Switch"
          doneMessage={`Done! ${deviceName ?? 'Your device'} now shows “${switching.name}”.`}
          udid={switching.udid}
          run={() => window.jiggle.apply.switchTo(switching.udid, switching.id)}
          onClose={() => setSwitching(undefined)}
        />
      )}
      {renaming && (
        <RenameLayoutSheet
          layout={renaming}
          taken={savedNames(data, renaming.id)}
          onClose={() => setRenaming(undefined)}
        />
      )}
      {deleting && <DeleteLayoutSheet layout={deleting} onClose={() => setDeleting(undefined)} />}
      {restoring && (
        <ApplySheet
          title={`Restore “${restoring.name ?? restoring.reason ?? 'backup'}”?`}
          lines={[
            `Back to ${when(restoring.createdAt, isToday(restoring.createdAt))}: ${plural(restoring.appCount, 'app')} on ${plural(restoring.pageCount, 'page')}`
          ]}
          confirmLabel="Restore"
          doneMessage={`Restored. ${deviceName ?? 'Your device'} is back as it was.`}
          udid={restoring.udid}
          run={() => window.jiggle.apply.restore(restoring.udid, restoring.id)}
          onClose={() => setRestoring(undefined)}
        />
      )}
    </div>
  )
}
