import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { NAV_ITEMS } from '@shared/nav'

const TITLES: Record<string, string> = {
  '/connect': 'Connect',
  ...Object.fromEntries(NAV_ITEMS.map((n) => [n.path, n.label]))
}

export function App() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Jiggle'
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="drag" />
        <div className="device-header">
          <div className="device-name">No device</div>
        </div>
        <nav>
          {NAV_ITEMS.map((n) => (
            <NavLink key={n.path} to={n.path} className="nav-item">
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="toolbar drag">
          <h1>{title}</h1>
        </header>
        <section className="screen">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/connect" element={<Placeholder name="Connect" />} />
            {NAV_ITEMS.map((n) => (
              <Route key={n.path} path={n.path} element={<Placeholder name={n.label} />} />
            ))}
          </Routes>
        </section>
      </main>
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return <p className="placeholder">{name} is coming soon.</p>
}
