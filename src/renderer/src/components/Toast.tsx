import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../state/queries'
import { clearUndo, signatureOf, useUndoOffer } from '../state/undo'
import { CheckIcon } from './icons'
import s from './toast.module.css'

const SHOW_MS = 3500
const SHOW_WITH_ACTION_MS = 8000

interface Shown {
  message: string
  reveal?: string // a file just exported: offer to show it in Finder
}

// Messages from main ("Backed up · 187 apps"), bottom centre, gone after a few seconds.
export function Toast() {
  const [shown, setShown] = useState<Shown>()
  const qc = useQueryClient()
  const undo = useUndoOffer()
  const phone = useLayout(undo?.udid).data
  useEffect(() => window.jiggle.toast.onShow((message) => setShown({ message })), [])
  useEffect(
    () =>
      window.jiggle.export.onSaved((path) =>
        setShown({ message: `Exported to ${path.split('/').pop()}`, reveal: path })
      ),
    []
  )
  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(
      () => setShown(undefined),
      shown.reveal ? SHOW_WITH_ACTION_MS : SHOW_MS
    )
    return () => window.clearTimeout(timer)
  }, [shown])
  // The offer goes when the time is up, or as soon as the phone no longer shows what Jiggle wrote.
  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(clearUndo, SHOW_WITH_ACTION_MS)
    return () => window.clearTimeout(timer)
  }, [undo])
  useEffect(() => {
    if (undo?.written && phone && signatureOf(phone.layout) !== undo.written) clearUndo()
  }, [undo, phone])
  const undoNow = async (): Promise<void> => {
    if (!undo) return
    clearUndo()
    const result = await window.jiggle.apply.restore(undo.udid, undo.backup.id)
    for (const key of ['layout', 'apps', 'snapshots'])
      void qc.invalidateQueries({ queryKey: [key] })
    setShown({ message: result.ok ? 'Undone. Your layout is back as it was.' : result.message })
  }
  return (
    <div className={s.region} role="status" aria-live="polite">
      {undo && (
        <div className={s.toast}>
          <CheckIcon size={14} />
          {undo.message}
          <button className={s.action} onClick={() => void undoNow()}>
            Undo
          </button>
        </div>
      )}
      {!undo && shown && (
        <div className={s.toast}>
          <CheckIcon size={14} />
          {shown.message}
          {shown.reveal && (
            <button
              className={s.action}
              onClick={() => void window.jiggle.export.reveal(shown.reveal!)}
            >
              Show in Finder
            </button>
          )}
        </div>
      )}
    </div>
  )
}
