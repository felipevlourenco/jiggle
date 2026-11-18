import type { ReactNode } from 'react'
import { ErrorIcon, InfoIcon, WarnIcon } from './icons'
import s from './banner.module.css'

const ICONS = { info: InfoIcon, warning: WarnIcon, error: ErrorIcon }

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
  const Icon = ICONS[severity]
  return (
    <div className={`${s.banner} ${s[severity]}`} role={severity === 'error' ? 'alert' : 'status'}>
      <span className={s.icon}>
        <Icon />
      </span>
      <span className={s.text}>
        {title && <strong>{title}</strong>} {children}
      </span>
    </div>
  )
}
