import { useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { applyCleanup, findCleanup, type CleanupIssue } from '@shared/layout/cleanup'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import type { Device } from '@shared/types'
import { Banner } from '../components/Banner'
import { CheckIcon } from '../components/icons'
import { LayoutThumb } from '../components/LayoutThumb'
import { ToolbarActions } from '../components/ToolbarSlot'
import { ApplySheet } from '../sheets/Apply'
import { useLayout } from '../state/queries'
import s from './cleanup.module.css'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

const title = (i: CleanupIssue): string =>
  i.kind === 'empty-page'
    ? `Page ${i.page + 1} is empty`
    : `Folder “${i.name}” has only 1 app (${i.app.name})`
const fix = (i: CleanupIssue): string =>
  i.kind === 'empty-page' ? 'Remove page' : 'Move the app out and remove the folder'

// S7: empty pages and one-app folders, each with a checkbox. "Fix Selected" goes through the Apply sheet.
export function Cleanup({ device }: { device: Device }) {
  const layout = useLayout(device.udid)
  const qc = useQueryClient()
  const before = layout.data?.layout
  const issues = useMemo(() => (before ? findCleanup(before) : []), [before])
  // What was unticked, so an issue that shows up later starts ticked.
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  const [applying, setApplying] = useState<{ chosen: CleanupIssue[]; beforeSig: string } | null>(
    null
  )
  const chosen = issues.filter((i) => !off.has(i.id))
  const readOnly = device.state === 'unsupported-os'

  let body: ReactNode
  if (layout.isError) {
    body = (
      <Banner severity="error" title="Couldn’t scan the layout.">
        <button className="btn" onClick={() => void layout.refetch()}>
          Try Again
        </button>
      </Banner>
    )
  } else if (!before) {
    body = (
      <p className={s.status} role="status">
        <span className="spin" aria-hidden="true" /> Scanning your layout…
      </p>
    )
  } else if (issues.length === 0) {
    body = (
      <div className={s.tidy}>
        <span className={s.check} aria-hidden="true">
          <CheckIcon size={28} />
        </span>
        <h2>Your home screen is tidy.</h2>
        <p>No empty pages and no one-app folders.</p>
      </div>
    )
  } else {
    body = (
      <>
        <h2 className="headline">{plural(issues.length, 'thing')} to tidy up</h2>
        <ul className={s.list}>
          {issues.map((i) => (
            <li key={i.id} className={`${s.card} card`}>
              <input
                type="checkbox"
                aria-label={title(i)}
                checked={!off.has(i.id)}
                onChange={(e) => {
                  const next = new Set(off)
                  if (e.target.checked) next.delete(i.id)
                  else next.add(i.id)
                  setOff(next)
                }}
              />
              <LayoutThumb
                udid={device.udid}
                items={before.pages[i.page] ?? []}
                grid={before.grid}
                kind={device.deviceClass}
              />
              <div className={s.text}>
                <strong>{title(i)}</strong>
                <span className="meta">{fix(i)}</span>
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className={s.root}>
      <ToolbarActions>
        <button
          className="btn btn-primary"
          disabled={chosen.length === 0 || readOnly || !before}
          onClick={() =>
            before && setApplying({ chosen, beforeSig: layoutSignature(serialize(before)) })
          }
        >
          Fix Selected
        </button>
      </ToolbarActions>
      {body}
      {applying && before && (
        <ApplySheet
          title={`Fix ${plural(applying.chosen.length, 'thing')} on ${device.name}?`}
          lines={[
            ...(applying.chosen.some((i) => i.kind === 'one-app-folder')
              ? [
                  `Move ${plural(applying.chosen.filter((i) => i.kind === 'one-app-folder').length, 'app')} out of one-app folders`
                ]
              : []),
            ...(applying.chosen.some((i) => i.kind === 'empty-page')
              ? [
                  `Remove ${plural(applying.chosen.filter((i) => i.kind === 'empty-page').length, 'empty page')}`
                ]
              : [])
          ]}
          doneMessage={`Done! ${device.name} is tidy.`}
          udid={device.udid}
          run={() =>
            window.jiggle.apply.run({
              udid: device.udid,
              reason: 'cleanup',
              beforeSignature: applying.beforeSig,
              after: applyCleanup(before, applying.chosen),
              removedFromHomeScreen: []
            })
          }
          onRefresh={() => void qc.invalidateQueries({ queryKey: ['layout'] })}
          onClose={() => setApplying(null)}
        />
      )}
    </div>
  )
}
