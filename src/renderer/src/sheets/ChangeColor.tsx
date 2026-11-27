import { useState } from 'react'
import { COLOR_FAMILIES, familyOf, type ColorFamily } from '@shared/layout/color'
import { SWATCH } from '../components/ColorOrder'
import { useApps } from '../state/queries'
import { Sheet } from './SaveLayout'
import s from './apply.module.css'
import n from './saveLayout.module.css'
import c from './changeColor.module.css'

// Change the color the Color sort sees for an app. The choice is kept on this computer.
export function ChangeColorSheet({
  udid,
  app,
  onClose
}: {
  udid: string
  app: { bundleId: string; name: string }
  onClose: () => void
}) {
  const apps = useApps(udid).data?.apps
  const color = apps?.find((a) => a.bundleId === app.bundleId)?.iconColor ?? null
  const now = apps ? familyOf(color) : undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const choose = (family: ColorFamily | null): void => {
    setBusy(true)
    window.jiggle.apps.setColor(app.bundleId, app.name, family).then(onClose, (err: Error) => {
      setBusy(false)
      setError(err.message)
    })
  }

  return (
    <Sheet label={`Change color of ${app.name}`} onClose={onClose}>
      <div className={s.head}>
        <h2>Change Color</h2>
      </div>
      <div className={s.body}>
        <span className="meta" role="status">
          {!now
            ? 'Reading colors…'
            : `${app.name} · now ${now}${
                color?.chosen
                  ? ` (set by you; Jiggle sees ${familyOf({ ...color, chosen: undefined })})`
                  : ''
              }`}
        </span>
        <div className={c.grid} role="group" aria-label="Color">
          {COLOR_FAMILIES.map((family) => (
            <button
              key={family}
              type="button"
              className={c.choice}
              aria-pressed={family === now}
              disabled={busy || !now}
              onClick={() => choose(family)}
            >
              <i style={{ background: SWATCH[family] }} />
              {family}
            </button>
          ))}
        </div>
        {error && (
          <p className={n.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={s.footer}>
        {color?.chosen && (
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => choose(null)}
          >
            Use Jiggle’s color
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  )
}
