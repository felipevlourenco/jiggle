import type { ReactNode } from 'react'
import s from './banner.module.css'

// An inline notice at the top of a screen. `error` interrupts (role="alert"); the rest are polite.
export function Banner({
  severity = 'info',
  title,
  children
}: {
  severity?: 'info' | 'warning' | 'error'
  title?: string
  children: ReactNode
}) {
  return (
    <div className={`${s.banner} ${s[severity]}`} role={severity === 'error' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>} {children}
    </div>
  )
}
