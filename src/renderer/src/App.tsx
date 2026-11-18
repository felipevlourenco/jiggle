import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { NAV_ITEMS } from '@shared/nav'
import { Connect } from './screens/Connect'
import { HomeScreen } from './screens/HomeScreen'
import { useDevices, useDeviceEvents, useLayout } from './state/queries'

const TITLES: Record<string, string> = {
  '/connect': 'Connect',
  ...Object.fromEntries(NAV_ITEMS.map((n) => [n.path, n.label]))
}

export function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: devices, isSuccess } = useDevices()
  useDeviceEvents()

  // Until the device switcher exists (M20), the active device is the first one.
  const device = devices?.[0]
  // An unsupported iOS stays on Connect until the user accepts read-only mode.
  const [readOnlyUdid, setReadOnlyUdid] = useState<string>()
  const usable =
    device?.state === 'ready' ||
    (device?.state === 'unsupported-os' && device.udid === readOnlyUdid)
  // Load the layout (and cache its icons) as soon as a device is usable; screens share the result.
  useLayout(usable ? device?.udid : undefined)
  const title = TITLES[pathname] ?? 'Jiggle'

  // Connect is shown whenever there is no usable device, and left as soon as there is one.
  useEffect(() => {
    if (!isSuccess) return
    if (!usable && pathname !== '/connect') navigate('/connect', { replace: true })
    if (usable && pathname === '/connect') navigate('/home', { replace: true })
  }, [isSuccess, usable, pathname, navigate])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="drag" />
        <div className="device-header">
          <div className="device-name">
            {device
              ? `${device.name}${device.osVersion ? ` · iOS ${device.osVersion}` : ''}`
              : 'No device'}
          </div>
        </div>
        <nav>
          {NAV_ITEMS.map((n) =>
            usable ? (
              <NavLink key={n.path} to={n.path} className="nav-item">
                {n.label}
              </NavLink>
            ) : (
              <span key={n.path} className="nav-item disabled" aria-disabled="true">
                {n.label}
              </span>
            )
          )}
        </nav>
      </aside>
      <main className="content">
        <header className="toolbar drag">
          <h1>{title}</h1>
        </header>
        <section className="screen">
          {isSuccess && (
            <Routes>
              <Route path="/" element={<Navigate to={usable ? '/home' : '/connect'} replace />} />
              <Route
                path="/connect"
                element={
                  <Connect
                    device={device}
                    onContinueReadOnly={() => setReadOnlyUdid(device?.udid)}
                  />
                }
              />
              {device && <Route path="/home" element={<HomeScreen device={device} />} />}
              {NAV_ITEMS.filter((n) => n.path !== '/home').map((n) => (
                <Route key={n.path} path={n.path} element={<Placeholder name={n.label} />} />
              ))}
            </Routes>
          )}
        </section>
      </main>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return <p className="placeholder">{name} is coming soon.</p>
}
