import { useEffect, useRef, useState } from 'react'
import type { Device } from '@shared/types'
import { PhoneIcon, SwitchIcon, TabletIcon } from './icons'

const icon = (d: Device | undefined) => (d?.deviceClass === 'iPad' ? <TabletIcon /> : <PhoneIcon />)
const sub = (d: Device): string =>
  [d.modelName, d.osVersion && `${d.deviceClass === 'iPad' ? 'iPadOS' : 'iOS'} ${d.osVersion}`]
    .filter(Boolean)
    .join(' · ')

// The sidebar's device header. With more than one device connected it is also the switcher.
export function DeviceCard({
  devices,
  device,
  usable,
  onSelect
}: {
  devices: Device[]
  device: Device | undefined
  usable: boolean // the active device can be read
  onSelect: (udid: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', outside)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', outside)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const switchable = devices.length > 1
  const status = !device
    ? 'Not connected'
    : `${device.connection === 'wifi' ? 'Wi‑Fi' : 'USB'}${
        device.state === 'unsupported-os' && usable
          ? ' · Read‑only'
          : device.state === 'locked' || device.state === 'trust-pending'
            ? ' · Waiting'
            : ''
      }`
  const body = (
    <>
      <span className="device-icon">{icon(device)}</span>
      <span className="device-text">
        <span className="device-name">{device ? device.name : 'No device'}</span>
        <span className="device-sub">{device ? sub(device) : 'Connect an iPhone or iPad'}</span>
        <span
          className={`conn ${!device ? 'none' : usable && device.state === 'ready' ? '' : 'warn'}`}
        >
          <i />
          {status}
        </span>
      </span>
      {switchable && <SwitchIcon />}
    </>
  )
  const cls = `device-card${device ? '' : ' off'}`
  if (!switchable) {
    return (
      <div className={cls} data-testid="device-card" aria-label="Device">
        {body}
      </div>
    )
  }
  return (
    <div className="device-switch" ref={root}>
      <button
        className={`${cls} switchable`}
        data-testid="device-card"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Device"
        onClick={() => setOpen(!open)}
      >
        {body}
      </button>
      {open && (
        <div className="device-menu" role="menu">
          {devices.map((d) => (
            <button
              key={d.udid}
              role="menuitemradio"
              aria-checked={d.udid === device?.udid}
              onClick={() => {
                setOpen(false)
                onSelect(d.udid)
              }}
            >
              <span className="device-icon">{icon(d)}</span>
              <span className="device-text">
                <span className="device-name">{d.name}</span>
                <span className="device-sub">{d.modelName}</span>
              </span>
              <i className={`dot ${d.state === 'ready' ? '' : 'warn'}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
