import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDevices } from '../state/queries'
import { offerUndo } from '../state/undo'
import { appError } from '@shared/errors'
import type { ApplyResult, ApplyStep, SnapshotSummary } from '@shared/types'
import {
  CheckIcon,
  ErrorIcon,
  FolderIcon,
  MoveIcon,
  ShieldIcon,
  WarnIcon
} from '../components/icons'
import s from './apply.module.css'

const steps = (kind: string): { step: ApplyStep; label: string }[] => [
  { step: 'checking', label: 'Checking layout' },
  { step: 'backing-up', label: 'Backing up' },
  { step: 'writing', label: `Writing to ${kind}` },
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
  const kind = useDevices().data?.find((d) => d.udid === udid)?.deviceClass ?? 'iPhone'
  const stepList = steps(kind)
  const [phase, setPhase] = useState<Phase>({ name: 'confirm' })
  const running = phase.name === 'running'
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  })

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

  const current = phase.name === 'running' ? stepList.findIndex((x) => x.step === phase.step) : -1
  const writing = phase.name === 'running' && phase.step === 'writing'

  return (
    <dialog
      ref={dialog}
      className={s.sheet}
      aria-label={title}
      // Esc and the backdrop must not close a sheet that is writing to the phone.
      onCancel={(e) => running && e.preventDefault()}
      onClose={() => {
        // Closed after a change (not after an undo): keep the way back one click away for a while.
        const p = phaseRef.current
        if (p.name === 'done' && !p.undone) void offerUndo(qc, udid, p.backup, 'Applied.')
        onClose()
      }}
    >
      {phase.name === 'confirm' && (
        <>
          <div className={s.head}>
            <h2>{title}</h2>
          </div>
          <div className={s.body}>
            <ul className={s.lines}>
              {lines.map((l) => (
                <li key={l}>
                  {/folder/.test(l) ? <FolderIcon /> : <MoveIcon />}
                  {l}
                </li>
              ))}
            </ul>
            <p className="assure">
              <ShieldIcon />
              <span>
                Your current layout will be backed up first. You can restore it anytime from
                History.
              </span>
            </p>
          </div>
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
          <div className={s.head}>
            <h2>{phase.undo ? 'Restoring your backup…' : 'Applying…'}</h2>
            <span className="meta">Keep your {kind} connected and unlocked.</span>
          </div>
          <div className={s.body}>
            <progress
              className={s.bar}
              max={stepList.length}
              value={current + 1}
              aria-label="Progress"
            />
            <ol className={s.steps}>
              {stepList.map(({ step, label }, i) => (
                <li
                  key={step}
                  className={i === current ? s.now : i < current ? s.past : undefined}
                  aria-current={i === current ? 'step' : undefined}
                >
                  <span className={s.mark} aria-hidden="true">
                    {i < current ? (
                      <span className={s.ok}>
                        <CheckIcon size={11} />
                      </span>
                    ) : i === current ? (
                      <span className="spin" />
                    ) : (
                      <span className={s.todo} />
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </div>
          <div className={s.footer}>
            {writing ? (
              <span className="meta">Cancel is unavailable while writing.</span>
            ) : (
              <button className="btn" disabled>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {phase.name === 'done' && (
        <>
          <div className={s.done}>
            <span className={s.check} aria-hidden="true">
              <CheckIcon size={28} />
            </span>
            <h2>{phase.undone ? `Restored. Your ${kind} is back as it was.` : doneMessage}</h2>
          </div>
          <div className={`${s.footer} ${s.center}`}>
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
          <div className={s.problem}>
            <span
              className={s.problemIcon}
              style={phase.result.code === 'layout-changed' ? undefined : { color: 'var(--error)' }}
            >
              {phase.result.code === 'layout-changed' ? (
                <WarnIcon size={32} />
              ) : (
                <ErrorIcon size={32} />
              )}
            </span>
            <div className={s.problemText}>
              <h2>{appError(phase.result.code).title}</h2>
              <p role="alert">{phase.result.message}</p>
            </div>
          </div>
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
