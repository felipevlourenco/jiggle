import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { NAV_ITEMS } from '@shared/nav'
import { Connect } from './screens/Connect'
import {
  AppsIcon,
  CleanupIcon,
  HistoryIcon,
  HomeIcon,
  OrganizeIcon,
  PhoneIcon
} from './components/icons'
import { ToolbarSlotContext } from './components/ToolbarSlot'
import { Apps } from './screens/Apps'
import { Banner } from './components/Banner'
import { Toast } from './components/Toast'
import { History } from './screens/History'
import { HomeScreen } from './screens/HomeScreen'
import { Organize } from './screens/Organize'
import { SettingsWindow } from './settings/SettingsWindow'
import { appError } from '@shared/errors'
import { SaveLayoutSheet } from './sheets/SaveLayout'
import { PinsProvider } from './state/pins'
import { useDevices, useDeviceEvents, useLayout, useSidecarStatus } from './state/queries'

const NAV_ICONS: Record<string, typeof HomeIcon> = {
  '/home': HomeIcon,
  '/apps': AppsIcon,
  '/organize': OrganizeIcon,
  '/history': HistoryIcon,
  '/cleanup': CleanupIcon
}

const TITLES: Record<string, string> = {
  '/connect': 'Connect',
  ...Object.fromEntries(NAV_ITEMS.map((n) => [n.path, n.label]))
}

export function App() {
  // The Settings window loads this same page at #/settings.
  return useLocation().pathname === '/settings' ? <SettingsWindow /> : <Shell />
}

function Shell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: devices, isSuccess } = useDevices()
  useDeviceEvents()
  const engine = useSidecarStatus()

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
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)
  // File > Save Layout… and History's button both open the same sheet.
  const [saving, setSaving] = useState(false)
  useEffect(() => window.jiggle.snapshots.onSaveRequested(() => setSaving(true)), [])
  if (saving && !usable) setSaving(false) // not to pop up again when the phone comes back

  // Connect is shown whenever there is no usable device, and left as soon as there is one.
  useEffect(() => {
    if (!isSuccess) return
    if (!usable && pathname !== '/connect' && pathname !== '/history')
      navigate('/connect', { replace: true })
    if (usable && pathname === '/connect') navigate('/home', { replace: true })
  }, [isSuccess, usable, pathname, navigate])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="drag" />
        <div
          className={`device-card${device ? '' : ' off'}`}
          data-testid="device-card"
          aria-label="Device"
        >
          <span className="device-icon">
            <PhoneIcon />
          </span>
          <span className="device-text">
            <span className="device-name">{device ? device.name : 'No device'}</span>
            <span className="device-sub">
              {device
                ? [device.modelName, device.osVersion && `iOS ${device.osVersion}`]
                    .filter(Boolean)
                    .join(' · ')
                : 'Connect an iPhone or iPad'}
            </span>
            <span
              className={`conn ${!device ? 'none' : usable && device.state === 'ready' ? '' : 'warn'}`}
            >
              <i />
              {!device
                ? 'Not connected'
                : `${device.connection === 'wifi' ? 'Wi‑Fi' : 'USB'}${
                    device.state === 'unsupported-os' && usable
                      ? ' · Read‑only'
                      : device.state === 'ready'
                        ? ''
                        : device.state === 'locked' || device.state === 'trust-pending'
                          ? ' · Waiting'
                          : ''
                  }`}
            </span>
          </span>
        </div>
        <nav>
          {NAV_ITEMS.map((n) => {
            const Icon = NAV_ICONS[n.path]!
            return usable || n.offline ? (
              <NavLink key={n.path} to={n.path} className="nav-item">
                <Icon />
                {n.label}
              </NavLink>
            ) : (
              <span key={n.path} className="nav-item disabled" aria-disabled="true">
                <Icon />
                {n.label}
              </span>
            )
          })}
        </nav>
      </aside>
      <main className="content">
        <header className="toolbar drag">
          <h1>{title}</h1>
          <div className="toolbar-actions" ref={setToolbarSlot} />
        </header>
        {engine === 'restarting' && (
          <Banner severity="warning" title={appError('engine-restarting').title}>
            {appError('engine-restarting').message}
          </Banner>
        )}
        {engine === 'failed' && (
          <Banner severity="error" title={appError('engine-failed').title}>
            {appError('engine-failed').message}
          </Banner>
        )}
        {usable && device?.state === 'unsupported-os' && (
          <Banner severity="warning" title={appError('read-only').title}>
            {appError('read-only', { version: device.osVersion }).message}
          </Banner>
        )}
        <section className="screen">
          {isSuccess && (
            <PinsProvider udid={usable ? device?.udid : undefined}>
              <ToolbarSlotContext.Provider value={toolbarSlot}>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to={usable ? '/home' : '/connect'} replace />}
                  />
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
                  {device && <Route path="/apps" element={<Apps device={device} />} />}
                  {device && <Route path="/organize" element={<Organize device={device} />} />}
                  <Route
                    path="/history"
                    element={
                      <History
                        udid={device?.udid}
                        deviceName={device?.name}
                        canBackUp={usable}
                        canRestore={device?.state === 'ready'}
                        onSaveLayout={() => setSaving(true)}
                      />
                    }
                  />
                  {NAV_ITEMS.filter(
                    (n) => !['/home', '/apps', '/organize', '/history'].includes(n.path)
                  ).map((n) => (
                    <Route key={n.path} path={n.path} element={<Placeholder name={n.label} />} />
                  ))}
                </Routes>
              </ToolbarSlotContext.Provider>
            </PinsProvider>
          )}
        </section>
      </main>
      {saving && usable && device && (
        <SaveLayoutSheet device={device} onClose={() => setSaving(false)} />
      )}
      <Toast />
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return <p className="placeholder">{name} is coming soon.</p>
}
