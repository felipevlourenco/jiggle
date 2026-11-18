import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { movedIds } from '@shared/layout/diff'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { sortLayout, type SortOptions } from '@shared/layout/sort'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { AppItem, Device, Layout, LayoutItem } from '@shared/types'
import { BeforeAfter } from '../components/BeforeAfter'
import { Thumb } from '../components/Thumb'
import { ApplySheet } from '../sheets/Apply'
import { useApps, useLayout } from '../state/queries'
import { useOrganizeChoice } from '../state/store'
import s from './organize.module.css'

const PRESETS: { by: SortOptions['by']; title: string; blurb: string }[] = [
  { by: 'name', title: 'A–Z', blurb: 'Alphabetical by name' },
  { by: 'category', title: 'Category', blurb: 'Grouped by App Store category' }
]
const WIDGET_MODES: { mode: SortOptions['widgetMode']; label: string }[] = [
  { mode: 'keep-pages', label: 'Keep widget pages' },
  { mode: 'sort-around', label: 'Sort around widgets' }
]

const appsOf = (items: LayoutItem[]): AppItem[] =>
  items.flatMap((i) => (i.kind === 'app' ? [i] : i.kind === 'folder' ? i.pages.flat() : []))

export function Organize({ device }: { device: Device }) {
  const layout = useLayout(device.udid)
  const apps = useApps(device.udid)
  const [choice, setChoice] = useOrganizeChoice()
  const qc = useQueryClient()
  const [applying, setApplying] = useState(false)

  const categories = useMemo(
    () => new Map(apps.data?.apps.map((a) => [a.bundleId, a.category])),
    [apps.data]
  )
  const before = layout.data?.layout
  const preview = useMemo(() => {
    if (!before) return null
    const categoryOf = (id: string): string => categories.get(id) ?? 'Unknown'
    const sorted = (by: SortOptions['by']): Layout =>
      sortLayout(before, { by, widgetMode: choice.widgetMode, categoryOf })
    const after = sorted(choice.by)
    const moved = movedIds(before, after)
    // Apps inside a moved folder move with it.
    const movedApps = after.pages
      .flat()
      .filter((i) => moved.has(i.id))
      .reduce((n, i) => n + appsOf([i]).length, 0)
    return {
      after,
      moved,
      movedApps,
      totalApps: appsOf([...before.dock, ...before.pages.flat()]).length,
      widgetPages: after.pages.filter((p) => p.some((i) => i.kind !== 'app' && i.kind !== 'folder'))
        .length,
      issues: validateLayout(before, after),
      samples: Object.fromEntries(
        PRESETS.map((p) => [p.by, appsOf(sorted(p.by).pages.flat()).slice(0, 5)])
      ) as Record<SortOptions['by'], AppItem[]>
    }
  }, [before, categories, choice])

  if (layout.isError) {
    return (
      <div className={s.message} role="alert">
        <h2>Couldn’t read the home screen</h2>
        <p>Make sure your {device.deviceClass} is unlocked and connected.</p>
        <button className="btn btn-primary" onClick={() => void layout.refetch()}>
          Try Again
        </button>
      </div>
    )
  }
  const waitingForCategories = choice.by === 'category' && apps.isPending
  if (!before || !preview || waitingForCategories) {
    return (
      <p className={s.status} role="status">
        Building preview…
      </p>
    )
  }

  const presetTitle = PRESETS.find((p) => p.by === choice.by)!.title
  const readOnly = device.state === 'unsupported-os'
  const blocked = preview.issues.length > 0
  const lookup = apps.data?.lookup
  return (
    <div className={s.root}>
      <div className={s.top}>
        <div className={s.presets} role="radiogroup" aria-label="Sort by">
          {PRESETS.map((p) => (
            <button
              key={p.by}
              role="radio"
              aria-checked={choice.by === p.by}
              className={s.card}
              onClick={() => setChoice({ by: p.by })}
            >
              <span className={s.strip}>
                {preview.samples[p.by].map((a) => (
                  <Thumb key={a.id} udid={device.udid} app={a} />
                ))}
              </span>
              <strong>{p.title}</strong>
              <span className={s.blurb}>{p.blurb}</span>
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          disabled={readOnly || blocked}
          onClick={() => setApplying(true)}
        >
          Apply to iPhone
        </button>
      </div>

      <div className={s.options}>
        <div className={s.segmented} role="radiogroup" aria-label="Widgets">
          {WIDGET_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              role="radio"
              aria-checked={choice.widgetMode === mode}
              className={s.segment}
              onClick={() => setChoice({ widgetMode: mode })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {readOnly && (
        <p className={s.banner} role="alert">
          Apply is turned off for iOS {device.osVersion}.
        </p>
      )}
      {blocked && (
        <p className={`${s.banner} ${s.error}`} role="alert">
          This layout can’t be applied: {preview.issues.map(describeIssue).join('; ')}.
        </p>
      )}
      {choice.by === 'category' && lookup && lookup !== 'idle' && (
        <p className={s.banner} role="status">
          {lookup === 'offline'
            ? 'Can’t reach the App Store, so some apps are grouped as Unknown.'
            : 'Still looking up categories: the preview may change.'}
        </p>
      )}

      <BeforeAfter before={before} after={preview.after} moved={preview.moved} udid={device.udid} />

      <p className={s.summary} data-testid="summary">
        {preview.movedApps} of {preview.totalApps} apps will move
        {preview.widgetPages > 0 &&
          ` · ${preview.widgetPages} widget page${preview.widgetPages === 1 ? '' : 's'} kept`}
      </p>

      {applying && (
        <ApplySheet
          title={`Apply ${presetTitle} to ${device.name}?`}
          lines={[
            `${preview.movedApps} apps will move`,
            ...(preview.widgetPages > 0
              ? [`${preview.widgetPages} widget page${preview.widgetPages === 1 ? '' : 's'} kept`]
              : [])
          ]}
          doneMessage={`Done! ${device.name} is sorted ${presetTitle}.`}
          udid={device.udid}
          run={() =>
            window.jiggle.apply.run({
              udid: device.udid,
              reason: `${presetTitle} sort`,
              beforeSignature: layoutSignature(serialize(before)),
              after: preview.after,
              removedFromHomeScreen: []
            })
          }
          onRefresh={() => void qc.invalidateQueries({ queryKey: ['layout'] })}
          onClose={() => setApplying(false)}
        />
      )}
    </div>
  )
}
