import { useEffect, useState } from 'react'
import { appRows, appsToCsv, CSV_COLUMNS, CSV_LABELS, type CsvColumn } from '@shared/csv'
import type { Device, ExportRequest, ExportResult } from '@shared/types'
import { LayoutThumb } from '../components/LayoutThumb'
import { useApps, useLayout } from '../state/queries'
import { Sheet } from './SaveLayout'
import s from './apply.module.css'
import x from './exportSheet.module.css'

type Format = 'png' | 'pdf' | 'csv'
const FORMATS: { format: Format; label: string }[] = [
  { format: 'png', label: 'Image (PNG)' },
  { format: 'pdf', label: 'PDF' },
  { format: 'csv', label: 'App List (CSV)' }
]

// S8: pick a format and what goes in it; "Export…" then opens the macOS save dialog.
export function ExportSheet({ device, onClose }: { device: Device; onClose: () => void }) {
  const layout = useLayout(device.udid).data?.layout
  const apps = useApps(device.udid).data
  const [format, setFormat] = useState<Format>('png')
  const [page, setPage] = useState<'all' | number>('all')
  const [wallpaper, setWallpaper] = useState(true)
  const [columns, setColumns] = useState<ReadonlySet<CsvColumn>>(new Set(CSV_COLUMNS))
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => window.jiggle.export.onProgress(setProgress), [])

  const pageCount = layout?.pages.length ?? 0
  const picture = format !== 'csv'
  const ready = picture ? pageCount > 0 : !!apps && !!layout && columns.size > 0
  const shownPage = layout?.pages[(page === 'all' ? 1 : page) - 1] ?? []

  const request = (): ExportRequest | undefined => {
    if (picture) return { format, udid: device.udid, page, wallpaper }
    if (!apps || !layout) return undefined
    const chosen = CSV_COLUMNS.filter((c) => columns.has(c))
    return {
      format: 'csv',
      udid: device.udid,
      content: appsToCsv(appRows(apps.apps, layout), chosen)
    }
  }

  const run = async (): Promise<void> => {
    const req = request()
    if (!req) return
    setBusy(true)
    setError(undefined)
    setProgress(undefined)
    let result: ExportResult
    try {
      result = await window.jiggle.export.run(req)
    } catch (err) {
      result = { ok: false, canceled: false, message: (err as Error).message }
    }
    if (result.ok) return onClose() // main announces the file with a toast
    setBusy(false)
    if (!result.canceled) setError(result.message) // a cancelled dialog is not an error
  }

  return (
    <Sheet label="Export" width={600} onClose={onClose}>
      <div className={s.head}>
        <h2>Export</h2>
      </div>
      <div className={`${s.body} ${x.body}`}>
        <div className="seg" role="radiogroup" aria-label="Format">
          {FORMATS.map(({ format: f, label }) => (
            <button
              key={f}
              role="radio"
              aria-checked={format === f}
              disabled={busy}
              onClick={() => setFormat(f)}
            >
              {label}
            </button>
          ))}
        </div>

        {picture ? (
          <div className={x.options}>
            {layout && (
              <LayoutThumb
                udid={device.udid}
                items={shownPage}
                grid={layout.grid}
                kind={device.deviceClass}
                scale={1.35}
              />
            )}
            <div className={x.fields}>
              <label className={x.row}>
                Pages
                <select
                  className="field"
                  value={String(page)}
                  disabled={busy}
                  onChange={(e) =>
                    setPage(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                >
                  <option value="all">All pages</option>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Page {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sw">
                <input
                  type="checkbox"
                  checked={wallpaper}
                  disabled={busy}
                  onChange={(e) => setWallpaper(e.target.checked)}
                />
                Include wallpaper
              </label>
              <p className="meta">
                {format === 'png'
                  ? 'One picture per page.'
                  : 'One PDF with a page for every home screen page.'}
              </p>
            </div>
          </div>
        ) : (
          <fieldset className={x.columns} disabled={busy}>
            <legend>Columns</legend>
            {CSV_COLUMNS.map((c) => (
              <label key={c} className="sw">
                <input
                  type="checkbox"
                  checked={columns.has(c)}
                  onChange={(e) => {
                    const next = new Set(columns)
                    if (e.target.checked) next.add(c)
                    else next.delete(c)
                    setColumns(next)
                  }}
                />
                {CSV_LABELS[c]}
              </label>
            ))}
            <p className="meta">One row per installed app.</p>
          </fieldset>
        )}

        {busy && (
          <p className="meta" role="status">
            <span className="spin" aria-hidden="true" />{' '}
            {progress
              ? `Rendering page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : 'Exporting…'}
          </p>
        )}
        {error && (
          <p className={x.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={s.footer}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void run()}>
          Export…
        </button>
      </div>
    </Sheet>
  )
}
