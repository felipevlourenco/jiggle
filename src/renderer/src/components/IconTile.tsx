import { useState } from 'react'
import { iconUrl } from '@shared/assets'
import type { AppItem } from '@shared/types'
import { usePins } from '../state/pins'
import { PinIcon } from './icons'
import s from './tiles.module.css'

const hueOf = (id: string): number => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// The app's cached icon, or a coloured letter tile when it isn't available.
export function AppIcon({ udid, app }: { udid: string; app: AppItem }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div
        className={`${s.icon} ${s.fallback}`}
        style={{ background: `hsl(${hueOf(app.bundleId)} 45% 55%)` }}
        aria-hidden="true"
      >
        {app.name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      className={s.icon}
      src={iconUrl(udid, app.bundleId)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

export function IconTile({
  udid,
  app,
  label = true
}: {
  udid: string
  app: AppItem
  label?: boolean
}) {
  const { pins, openMenu } = usePins()
  return (
    <div
      className={s.tile}
      data-kind="app"
      title={app.name}
      onContextMenu={(e) => openMenu(e, app)}
    >
      <AppIcon udid={udid} app={app} />
      {pins.apps.includes(app.bundleId) && (
        <span className={s.pin} data-testid="pin-badge">
          <PinIcon size={9} />
        </span>
      )}
      {label && <span className={s.label}>{app.name}</span>}
    </div>
  )
}
