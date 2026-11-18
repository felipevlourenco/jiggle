import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApplyResult, ApplyStep, SnapshotSummary } from '@shared/types'
import s from './apply.module.css'

const STEPS: { step: ApplyStep; label: string }[] = [
  { step: 'checking', label: 'Checking layout' },
  { step: 'backing-up', label: 'Backing up' },
  { step: 'writing', label: 'Writing to iPhone' },
  { step: 'verifying', label: 'Verifying' }
]

interface Props {
  title: string // "Apply A–Z to Sam's iPhone?"
  lines: string[] // "142 apps will move"
  confirmLabel?: string
  doneMessage: string // "Done! Sam's iPhone is sorted A–Z."
  udid: string
  run: () => Promise<ApplyResult>
  onClose: () => void
  // "Your iPhone's layout changed": the screen re-reads the phone.
  onRefresh?: () => void
}

type Phase =
  | { name: 'confirm' }
  | { name: 'running'; step: ApplyStep; undo: boolean }
  | { name: 'done'; backup: SnapshotSummary; undone: boolean }
  | { name: 'error'; result: Extract<ApplyResult, { ok: false }> }

// S5: confirm, then progress, then the result. One sheet for every change to the phone.
export function ApplySheet({
  title,
  lines,
  confirmLabel = 'Apply',
  doneMessage,
  udid,
  run,
  onClose,
  onRefresh
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const started = useRef(false)
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ name: 'confirm' })
  const running = phase.name === 'running'

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(
    () =>
      window.jiggle.apply.onProgress((step) =>
        setPhase((p) => (p.name === 'running' ? { ...p, step } : p))
      ),
    []
  )

  const go = async (work: () => Promise<ApplyResult>, undo: boolean): Promise<void> => {
    if (started.current) return // a double click starts one change, not two
    started.current = true
    setPhase({ name: 'running', step: 'checking', undo })
    let result: ApplyResult
    try {
      result = await work()
    } catch (err) {
      result = { ok: false, code: 'write-failed', message: (err as Error).message }
    }
    started.current = false
    // The phone and the backup list may have changed, whatever the outcome.
    for (const key of ['layout', 'apps', 'snapshots'])
      void qc.invalidateQueries({ queryKey: [key] })
    setPhase(
      result.ok ? { name: 'done', backup: result.backup, undone: undo } : { name: 'error', result }
    )
  }
  const undoWith = (backup: SnapshotSummary): Promise<void> =>
    go(() => window.jiggle.apply.restore(udid, backup.id), true)

  const current = phase.name === 'running' ? STEPS.findIndex((x) => x.step === phase.step) : -1
  const writing = phase.name === 'running' && phase.step === 'writing'

  return (
    <dialog
      ref={dialog}
      className={s.sheet}
      aria-label={title}
      // Esc and the backdrop must not close a sheet that is writing to the phone.
      onCancel={(e) => running && e.preventDefault()}
      onClose={onClose}
    >
      {phase.name === 'confirm' && (
        <>
          <h2>{title}</h2>
          <ul className={s.lines}>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className={s.reassure}>
            <span aria-hidden="true">🛡 </span>
            Your current layout will be backed up first. You can restore it anytime from History.
          </p>
          <div className={s.footer}>
            <button className="btn" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void go(run, false)}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}

      {phase.name === 'running' && (
        <>
          <h2>{phase.undo ? 'Restoring your backup…' : 'Applying…'}</h2>
          <progress
            className={s.bar}
            max={STEPS.length}
            value={current + 1}
            aria-label="Progress"
          />
          <ol className={s.steps}>
            {STEPS.map(({ step, label }, i) => (
              <li
                key={step}
                className={i === current ? s.now : i < current ? s.past : undefined}
                aria-current={i === current ? 'step' : undefined}
              >
                {label}
              </li>
            ))}
          </ol>
          {!writing && (
            <div className={s.footer}>
              <button className="btn" disabled>
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {phase.name === 'done' && (
        <>
          <div className={s.check} aria-hidden="true">
            ✓
          </div>
          <h2>{phase.undone ? 'Restored. Your iPhone is back as it was.' : doneMessage}</h2>
          <div className={s.footer}>
            {!phase.undone && (
              <button className="btn" onClick={() => void undoWith(phase.backup)}>
                Undo (Restore Backup)
              </button>
            )}
            <button className="btn btn-primary" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </>
      )}

      {phase.name === 'error' && (
        <>
          <h2>Couldn’t finish</h2>
          <p role="alert">{phase.result.message}</p>
          <div className={s.footer}>
            {phase.result.code === 'layout-changed' && onRefresh && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  onRefresh()
                  dialog.current?.close()
                }}
              >
                Refresh Preview
              </button>
            )}
            {phase.result.backup && (
              <button
                className="btn btn-primary"
                onClick={() => void undoWith(phase.result.backup!)}
              >
                Restore Backup
              </button>
            )}
            <button className="btn" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
