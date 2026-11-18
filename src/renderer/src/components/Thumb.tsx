import { useState } from 'react'
import { iconUrl } from '@shared/assets'
import type { AppInfo } from '@shared/types'
import s from './thumb.module.css'

// A small app icon for lists: the cached icon, or a letter when there is none.
export function Thumb({ udid, app }: { udid: string; app: Pick<AppInfo, 'bundleId' | 'name'> }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span className={`${s.thumb} ${s.letter}`} aria-hidden="true">
      {app.name.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img
      className={s.thumb}
      src={iconUrl(udid, app.bundleId)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
