import { useId, useState, type FormEvent } from 'react'
import { APP_STORE_CATEGORIES } from '@shared/categories'
import type { AppInfo } from '@shared/types'
import { Sheet } from './SaveLayout'
import s from './apply.module.css'
import n from './saveLayout.module.css'

// Change an app's category. The choice is kept on this Mac and wins over the App Store's.
export function ChangeCategorySheet({
  app,
  known,
  onClose
}: {
  app: AppInfo
  known: string[] // categories the apps have now, offered next to the App Store's
  onClose: () => void
}) {
  const [category, setCategory] = useState(app.category === 'Unknown' ? '' : app.category)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const listId = useId()
  const suggestions = [
    ...new Set([...APP_STORE_CATEGORIES, ...known.filter((k) => k !== 'Unknown')])
  ]
  const clean = category.trim()
  const overridden = app.categorySource === 'override'

  const finish = async (
    work: () => Promise<{ ok: true } | { ok: false; message: string } | void>
  ) => {
    setBusy(true)
    const result = await work().catch((err: Error) => ({
      ok: false as const,
      message: err.message
    }))
    if (result && !result.ok) {
      setBusy(false)
      setError(result.message)
    } else onClose()
  }
  const save = (e: FormEvent): void => {
    e.preventDefault()
    if (clean && clean !== app.category && !busy)
      void finish(() => window.jiggle.apps.setCategory(app.bundleId, app.name, clean))
  }

  return (
    <Sheet label={`Change category of ${app.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className={s.head}>
          <h2>Change Category</h2>
        </div>
        <div className={s.body}>
          <span className="meta">
            {app.name} · now {app.category}
            {overridden ? ' (set by you)' : ''}
          </span>
          <input
            className="field"
            type="text"
            list={listId}
            aria-label="Category"
            placeholder="e.g. Finance"
            autoFocus
            autoComplete="off"
            maxLength={60}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setError(undefined)
            }}
          />
          <datalist id={listId}>
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {error && (
            <p className={n.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={s.footer}>
          {overridden && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => void finish(() => window.jiggle.apps.resetCategory(app.bundleId))}
            >
              Reset to App Store
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !clean || clean === app.category}
          >
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
