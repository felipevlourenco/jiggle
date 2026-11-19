import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { NAV_ITEMS } from '@shared/nav'
import { Connect } from './screens/Connect'
import { DeviceCard } from './components/DeviceCard'
import { AppsIcon, CleanupIcon, HistoryIcon, HomeIcon, OrganizeIcon } from './components/icons'
import { ToolbarSlotContext } from './components/ToolbarSlot'
import { Apps } from './screens/Apps'
import { Banner } from './components/Banner'
import { Toast } from './components/Toast'
import { ExportPrint } from './screens/ExportPrint'
import { History } from './screens/History'
import { HomeScreen } from './screens/HomeScreen'
import { Organize } from './screens/Organize'
import { SettingsWindow } from './settings/SettingsWindow'
import { appError } from '@shared/errors'
import { ExportSheet } from './sheets/Export'
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
  const { pathname } = useLocation()
  if (pathname === '/export-print') return <ExportPrint />
  return pathname === '/settings' ? <SettingsWindow /> : <Shell />
}

function Shell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: devices, isSuccess } = useDevices()
  useDeviceEvents()
  const engine = useSidecarStatus()

  // The active device: the one picked in the switcher, else the first that is ready, else the first.
  const [chosen, setChosen] = useState<string>()
  const device =
    devices?.find((d) => d.udid === chosen) ??
    devices?.find((d) => d.state === 'ready') ??
    devices?.[0]
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
  const [exporting, setExporting] = useState(false) // File > Export… and the toolbar buttons
  useEffect(() => window.jiggle.snapshots.onSaveRequested(() => setSaving(true)), [])
  useEffect(() => window.jiggle.export.onRequested(() => setExporting(true)), [])
  if (exporting && !usable) setExporting(false)
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
        <DeviceCard devices={devices ?? []} device={device} usable={usable} onSelect={setChosen} />
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
                {/* Each device starts its screens afresh: no search, selection or page carried over. */}
                <Routes key={device?.udid}>
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
                  {device && (
                    <Route
                      path="/home"
                      element={<HomeScreen device={device} onExport={() => setExporting(true)} />}
                    />
                  )}
                  {device && (
                    <Route
                      path="/apps"
                      element={<Apps device={device} onExport={() => setExporting(true)} />}
                    />
                  )}
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
      {exporting && usable && device && (
        <ExportSheet device={device} onClose={() => setExporting(false)} />
      )}
      <Toast />
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return <p className="placeholder">{name} is coming soon.</p>
}
