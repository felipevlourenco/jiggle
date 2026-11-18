import { useEffect, useState } from 'react'
import { CheckIcon } from './icons'
import s from './toast.module.css'

const SHOW_MS = 3500

// Messages from main ("Backed up · 187 apps"), bottom centre, gone after a few seconds.
export function Toast() {
  const [message, setMessage] = useState<string>()
  useEffect(() => window.jiggle.toast.onShow(setMessage), [])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(undefined), SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [message])
  return (
    <div className={s.region} role="status" aria-live="polite">
      {message && (
        <div className={s.toast}>
          <CheckIcon size={14} />
          {message}
        </div>
      )}
    </div>
  )
}
