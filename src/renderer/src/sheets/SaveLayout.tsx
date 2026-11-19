import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { checkLayoutName, NAME_MAX } from '@shared/layout/names'
import { summarize } from '@shared/layout/summarize'
import type { Device, SavedLayoutResult, SnapshotEntry, SnapshotSummary } from '@shared/types'
import { LayoutThumb, SnapshotThumb } from '../components/LayoutThumb'
import { useLayout, useSnapshots } from '../state/queries'
import s from './apply.module.css'
import n from './saveLayout.module.css'

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

// The names the device's saved layouts already have.
export const savedNames = (entries: SnapshotEntry[] | undefined, exceptId?: string): string[] =>
  (entries ?? []).flatMap((e) =>
    !e.damaged && e.kind === 'saved-layout' && e.id !== exceptId && e.name ? [e.name] : []
  )

// A modal like the Apply sheet: opened by being mounted, closed by `onClose` (Esc included).
export function Sheet({
  label,
  onClose,
  width,
  locked,
  children
}: {
  label: string
  onClose: () => void
  width?: number // 520 unless given
  locked?: boolean // Esc does nothing: something is being written
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className={s.sheet}
      style={width ? { width } : undefined}
      aria-label={label}
      onCancel={(e) => locked && e.preventDefault()}
      onClose={onClose}
    >
      {children}
    </dialog>
  )
}

// S10: ask for a name. Used to save the phone's layout and to rename a saved one.
function NameSheet({
  title,
  confirmLabel,
  initial = '',
  taken,
  thumb,
  caption,
  submit,
  onClose
}: {
  title: string
  confirmLabel: string
  initial?: string
  taken: string[]
  thumb: ReactNode
  caption: string
  submit: (name: string) => Promise<SavedLayoutResult>
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const errorId = useId()
  const clean = name.trim()
  // An empty field only disables Save: it isn't an error yet.
  const problem = clean ? checkLayoutName(clean, taken) : null
  const shown = problem ?? failure
  const canSave = clean !== '' && clean !== initial && !problem && !busy

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    let result: SavedLayoutResult
    try {
      result = await submit(clean)
    } catch (err) {
      result = { ok: false, message: (err as Error).message }
    }
    if (result.ok) return onClose()
    setBusy(false)
    setFailure(result.message)
  }

  return (
    <Sheet label={title} onClose={onClose}>
      <form onSubmit={(e) => void save(e)}>
        <div className={s.head}>
          <h2>{title}</h2>
        </div>
        <div className={`${s.body} ${n.body}`}>
          {thumb}
          <div className={n.fields}>
            <span className="meta">{caption}</span>
            <input
              className="field"
              type="text"
              aria-label="Layout name"
              placeholder="e.g. Work"
              maxLength={NAME_MAX}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={name}
              aria-invalid={!!shown}
              aria-describedby={shown ? errorId : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setFailure(undefined)
              }}
            />
            {shown && (
              <p id={errorId} className={n.error} role="alert">
                {shown}
              </p>
            )}
          </div>
        </div>
        <div className={s.footer}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            {busy ? (
              <>
                <span className="spin" aria-hidden="true" /> Saving…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

// Save Current Layout: the phone's home screen, as the app last read it, under a name.
export function SaveLayoutSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const layout = useLayout(device.udid).data?.layout
  const saved = useSnapshots(device.udid).data
  const stats = layout && summarize(layout)
  return (
    <NameSheet
      title="Save Current Layout"
      confirmLabel="Save"
      taken={savedNames(saved)}
      thumb={
        layout && (
          <LayoutThumb
            udid={device.udid}
            items={layout.pages[0] ?? []}
            grid={layout.grid}
            kind={device.deviceClass}
            scale={1.35}
          />
        )
      }
      caption={
        stats
          ? `${device.name} · ${plural(stats.apps, 'app')} · ${plural(stats.pages, 'page')}`
          : device.name
      }
      submit={(name) => window.jiggle.snapshots.saveLayout(device.udid, name)}
      onClose={onClose}
    />
  )
}

export function RenameLayoutSheet({
  layout,
  taken,
  onClose
}: {
  layout: SnapshotSummary
  taken: string[]
  onClose: () => void
}) {
  return (
    <NameSheet
      title="Rename Layout"
      confirmLabel="Rename"
      initial={layout.name ?? ''}
      taken={taken}
      thumb={<SnapshotThumb snapshot={layout} scale={1.35} />}
      caption={`${plural(layout.appCount, 'app')} · ${plural(layout.pageCount, 'page')}`}
      submit={(name) => window.jiggle.snapshots.renameLayout(layout.udid, layout.id, name)}
      onClose={onClose}
    />
  )
}

// Deleting asks first. The phone isn't touched, and the automatic backups stay.
export function DeleteLayoutSheet({
  layout,
  onClose
}: {
  layout: SnapshotSummary
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const remove = async (): Promise<void> => {
    setBusy(true)
    let result: SavedLayoutResult
    try {
      result = await window.jiggle.snapshots.deleteLayout(layout.udid, layout.id)
    } catch (err) {
      result = { ok: false, message: (err as Error).message }
    }
    if (result.ok) return onClose()
    setBusy(false)
    setFailure(result.message)
  }
  return (
    <Sheet label={`Delete “${layout.name}”?`} onClose={onClose}>
      <div className={s.head}>
        <h2>Delete “{layout.name}”?</h2>
      </div>
      <div className={s.body}>
        <p className={n.note}>
          This saved layout will be deleted for good. Your {layout.deviceClass ?? 'iPhone'} isn’t
          changed.
        </p>
        {failure && (
          <p className={n.error} role="alert">
            {failure}
          </p>
        )}
      </div>
      <div className={s.footer}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          Delete
        </button>
      </div>
    </Sheet>
  )
}
