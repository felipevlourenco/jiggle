import { useEffect, useState } from 'react'
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
  return (
    <div className={s.region} role="status" aria-live="polite">
      {shown && (
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
