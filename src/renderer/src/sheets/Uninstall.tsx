import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Device, UninstallResult } from '@shared/types'
import { CheckIcon, ErrorIcon } from '../components/icons'
import { Sheet } from './SaveLayout'
import s from './apply.module.css'

const plural = (n: number): string => `${n} app${n === 1 ? '' : 's'}`

// "A", "A and B", "A, B and C", or the first five and "N more".
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const shown = names.length > 6 ? [...names.slice(0, 5), `${names.length - 5} more`] : names
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

type Phase =
  | { name: 'confirm' }
  | { name: 'running'; done: number; name_: string }
  | { name: 'done'; removed: number }
  | { name: 'error'; result: Extract<UninstallResult, { ok: false }> }

// The destructive alert: deleting apps can't be undone by a backup, so it says so and names them.
export function UninstallSheet({
  device,
  apps,
  onClose
}: {
  device: Device
  apps: { bundleId: string; name: string }[]
  onClose: (changed: boolean) => void // changed: some apps are gone, so the selection is stale
}) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ name: 'confirm' })
  const running = phase.name === 'running'
  const changed =
    (phase.name === 'done' && phase.removed > 0) ||
    (phase.name === 'error' && phase.result.removed > 0)
  useEffect(
    () =>
      window.jiggle.apps.onUninstallProgress(({ done, name }) =>
        setPhase((p) => (p.name === 'running' ? { name: 'running', done, name_: name } : p))
      ),
    []
  )

  const go = async (): Promise<void> => {
    setPhase({ name: 'running', done: 0, name_: apps[0]?.name ?? '' })
    let result: UninstallResult
    try {
      result = await window.jiggle.apps.uninstall(
        device.udid,
        apps.map((a) => a.bundleId)
      )
    } catch (err) {
      result = { ok: false, removed: 0, message: (err as Error).message }
    }
    // The phone changed, even if only some apps went.
    for (const key of ['layout', 'apps', 'snapshots'])
      void qc.invalidateQueries({ queryKey: [key] })
    setPhase(result.ok ? { name: 'done', removed: result.removed } : { name: 'error', result })
  }

  return (
    <Sheet
      label={`Uninstall ${plural(apps.length)} from ${device.name}?`}
      locked={running} // Esc must not close the sheet while apps are being deleted
      onClose={() => onClose(changed)}
    >
      {phase.name === 'confirm' && (
        <>
          <div className={s.head}>
            <h2>
              Uninstall {plural(apps.length)} from {device.name}?
            </h2>
          </div>
          <div className={s.body}>
            <p>
              {listNames(apps.map((a) => a.name))} will be deleted with{' '}
              {apps.length === 1 ? 'its' : 'their'} data. Your layout is backed up, but restoring it
              can’t reinstall apps.
            </p>
          </div>
          <div className={s.footer}>
            <button className="btn" onClick={() => onClose(changed)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={() => void go()}>
              Uninstall
            </button>
          </div>
        </>
      )}
      {phase.name === 'running' && (
        <>
          <div className={s.head}>
            <h2>Uninstalling…</h2>
            <span className="meta">Keep your {device.deviceClass} connected and unlocked.</span>
          </div>
          <div className={s.body}>
            <progress
              className={s.bar}
              max={apps.length}
              value={phase.done}
              aria-label="Progress"
            />
            <p role="status">
              <span className="spin" aria-hidden="true" /> {phase.name_} (
              {Math.min(phase.done + 1, apps.length)} of {apps.length})
            </p>
          </div>
          <div className={s.footer}>
            <button className="btn" disabled>
              Cancel
            </button>
          </div>
        </>
      )}
      {phase.name === 'done' && (
        <>
          <div className={s.done}>
            <span className={s.check} aria-hidden="true">
              <CheckIcon size={28} />
            </span>
            <h2>Done! {plural(phase.removed)} uninstalled.</h2>
          </div>
          <div className={`${s.footer} ${s.center}`}>
            <button className="btn btn-primary" onClick={() => onClose(changed)}>
              Close
            </button>
          </div>
        </>
      )}
      {phase.name === 'error' && (
        <>
          <div className={s.problem}>
            <span className={s.problemIcon} style={{ color: 'var(--error)' }}>
              <ErrorIcon size={32} />
            </span>
            <div className={s.problemText}>
              <h2>Couldn’t uninstall everything</h2>
              <p role="alert">
                {phase.result.message}
                {phase.result.removed > 0
                  ? ` ${plural(phase.result.removed)} had been removed.`
                  : ''}
              </p>
            </div>
          </div>
          <div className={s.footer}>
            <button className="btn" onClick={() => onClose(changed)}>
              Close
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
