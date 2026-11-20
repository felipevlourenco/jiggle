import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { movedIds } from '@shared/layout/diff'
import type { FolderRule } from '@shared/layout/folders'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { sortLayout, type SortOptions } from '@shared/layout/sort'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { AppItem, Device, Layout, LayoutItem } from '@shared/types'
import { BeforeAfter } from '../components/BeforeAfter'
import { CheckIcon } from '../components/icons'
import { ColorOrder } from '../components/ColorOrder'
import { ToolbarActions } from '../components/ToolbarSlot'
import { Banner } from '../components/Banner'
import { Thumb } from '../components/Thumb'
import { ApplySheet } from '../sheets/Apply'
import { usePins } from '../state/pins'
import { useApps, useLayout } from '../state/queries'
import { useOrganizeChoice } from '../state/store'
import s from './organize.module.css'

const PRESETS: { by: SortOptions['by']; title: string; blurb: string; sorted: string }[] = [
  { by: 'name', title: 'A–Z', blurb: 'Alphabetical by name', sorted: 'A–Z' },
  {
    by: 'category',
    title: 'Category',
    blurb: 'Grouped by App Store category',
    sorted: 'by category'
  },
  { by: 'color', title: 'Color', blurb: 'A rainbow of icons', sorted: 'by color' }
]
const WIDGET_MODES: { mode: SortOptions['widgetMode']; label: string }[] = [
  { mode: 'keep-pages', label: 'Keep widget pages' },
  { mode: 'sort-around', label: 'Sort around widgets' },
  { mode: 'fill', label: 'Sort widget pages too' }
]

const FOLDER_RULES: { rule: FolderRule | null; label: string }[] = [
  { rule: null, label: 'Off' },
  { rule: 'category', label: 'Category' },
  { rule: 'developer', label: 'Developer' },
  { rule: 'letter', label: 'First letter' }
]

const appsOf = (items: LayoutItem[]): AppItem[] =>
  items.flatMap((i) => (i.kind === 'app' ? [i] : i.kind === 'folder' ? i.pages.flat() : []))

export function Organize({ device }: { device: Device }) {
  const layout = useLayout(device.udid)
  const apps = useApps(device.udid)
  const [choice, setChoice] = useOrganizeChoice()
  const { pins, setPage1 } = usePins()
  const qc = useQueryClient()
  const [applying, setApplying] = useState(false)

  const categories = useMemo(
    () => new Map(apps.data?.apps.map((a) => [a.bundleId, a.category])),
    [apps.data]
  )
  const developers = useMemo(
    () => new Map(apps.data?.apps.map((a) => [a.bundleId, a.developer])),
    [apps.data]
  )
  const colors = useMemo(
    () => new Map(apps.data?.apps.map((a) => [a.bundleId, a.iconColor])),
    [apps.data]
  )
  const before = layout.data?.layout
  const preview = useMemo(() => {
    if (!before) return null
    const categoryOf = (id: string): string => categories.get(id) ?? 'Unknown'
    const sorted = (by: SortOptions['by']): Layout =>
      sortLayout(before, {
        by,
        widgetMode: choice.widgetMode,
        pins,
        folders: choice.folders ?? undefined,
        categoryOf,
        developerOf: (id) => developers.get(id) ?? null,
        colorOf: (id) => colors.get(id) ?? null,
        colorOrder: choice.colorOrder
      })
    const after = sorted(choice.by)
    const moved = movedIds(before, after)
    // Apps inside a moved folder move with it.
    const movedApps = after.pages
      .flat()
      .filter((i) => moved.has(i.id))
      .reduce((n, i) => n + appsOf([i]).length, 0)
    const made = after.pages.flat().filter((i) => i.kind === 'folder' && i.id.startsWith('folder:'))
    return {
      after,
      newFolders: made.length,
      moved,
      movedApps,
      totalApps: appsOf([...before.dock, ...before.pages.flat()]).length,
      removedPages: Math.max(0, before.pages.length - after.pages.length),
      widgetPages: after.pages.filter((p) => p.some((i) => i.kind !== 'app' && i.kind !== 'folder'))
        .length,
      issues: validateLayout(before, after),
      samples: Object.fromEntries(
        PRESETS.map((p) => [p.by, appsOf(sorted(p.by).pages.flat()).slice(0, 5)])
      ) as Record<SortOptions['by'], AppItem[]>
    }
  }, [before, categories, developers, colors, choice, pins])

  if (layout.isError) {
    return (
      <div className={s.message} role="alert">
        <h2>Couldn’t read the home screen</h2>
        <p>Make sure your {device.deviceClass} is unlocked and connected.</p>
        <button className="btn btn-primary btn-lg" onClick={() => void layout.refetch()}>
          Try Again
        </button>
      </div>
    )
  }
  const needsAppInfo =
    choice.by !== 'name' || choice.folders === 'category' || choice.folders === 'developer'
  const needsLookup =
    choice.by === 'category' || choice.folders === 'category' || choice.folders === 'developer'
  const waitingForCategories = needsAppInfo && apps.isPending
  if (!before || !preview || waitingForCategories) {
    return (
      <p className={s.status} role="status">
        <span className="spin" aria-hidden="true" /> Building preview…
      </p>
    )
  }

  const preset = PRESETS.find((p) => p.by === choice.by)!
  const presetTitle = preset.title
  const readOnly = device.state === 'unsupported-os'
  const blocked = preview.issues.length > 0
  const lookup = apps.data?.lookup
  return (
    <div className={s.root}>
      <ToolbarActions>
        <button
          className="btn btn-primary"
          disabled={readOnly || blocked}
          onClick={() => setApplying(true)}
        >
          Apply to {device.deviceClass}
        </button>
      </ToolbarActions>
      <div className={s.presets} role="radiogroup" aria-label="Sort by">
        {PRESETS.map((p) => (
          <button
            key={p.by}
            role="radio"
            aria-checked={choice.by === p.by}
            className={s.preset}
            onClick={() => setChoice({ by: p.by })}
          >
            {choice.by === p.by && (
              <span className={s.chk} aria-hidden="true">
                <CheckIcon size={10} />
              </span>
            )}
            <span className={s.strip}>
              {preview.samples[p.by].map((a) => (
                <Thumb key={a.id} udid={device.udid} app={a} />
              ))}
            </span>
            <span className={s.text}>
              <span className="headline">{p.title}</span>
              <span className="meta">{p.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <div className={s.options}>
        <span>Widgets</span>
        <div className="seg" role="radiogroup" aria-label="Widgets">
          {WIDGET_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              role="radio"
              aria-checked={choice.widgetMode === mode}
              onClick={() => setChoice({ widgetMode: mode })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sw">
          <input
            type="checkbox"
            checked={pins.page1}
            onChange={(e) => setPage1(e.target.checked)}
          />
          Pin page 1
        </label>
      </div>

      <div className={s.options}>
        <span>Folders</span>
        <div className="seg" role="radiogroup" aria-label="Folders">
          {FOLDER_RULES.map(({ rule, label }) => (
            <button
              key={label}
              role="radio"
              aria-checked={choice.folders === rule}
              onClick={() => setChoice({ folders: rule })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {choice.by === 'color' && (
        <div className={s.options}>
          <ColorOrder
            order={choice.colorOrder}
            onChange={(colorOrder) => setChoice({ colorOrder })}
          />
        </div>
      )}

      {blocked && (
        <Banner severity="error">
          This layout can’t be applied: {preview.issues.map(describeIssue).join('; ')}.
        </Banner>
      )}
      {needsLookup && lookup && lookup !== 'idle' && (
        <Banner severity="warning">
          {lookup === 'offline'
            ? 'Can’t reach the App Store, so some apps are grouped as Unknown or left out of folders.'
            : 'Still looking up categories: the preview may change.'}
        </Banner>
      )}

      <div className={`${s.stage} card`}>
        <BeforeAfter
          before={before}
          after={preview.after}
          moved={preview.moved}
          udid={device.udid}
          kind={device.deviceClass}
        />
      </div>

      <p className={s.summary} data-testid="summary">
        <i className={s.dot} aria-hidden="true" />
        <span>
          <b>
            {preview.movedApps} of {preview.totalApps} apps will move
          </b>
          {preview.widgetPages > 0 &&
            ` · ${preview.widgetPages} widget page${preview.widgetPages === 1 ? '' : 's'} kept`}
          {preview.removedPages > 0 &&
            ` · ${preview.removedPages} page${preview.removedPages === 1 ? '' : 's'} removed`}
          {preview.newFolders > 0 &&
            ` · ${preview.newFolders} folder${preview.newFolders === 1 ? '' : 's'} created`}
        </span>
      </p>

      {applying && (
        <ApplySheet
          title={`Apply ${presetTitle} to ${device.name}?`}
          lines={[
            `${preview.movedApps} apps will move`,
            ...(preview.removedPages > 0
              ? [`${preview.removedPages} page${preview.removedPages === 1 ? '' : 's'} removed`]
              : []),
            ...(preview.newFolders > 0
              ? [`${preview.newFolders} folder${preview.newFolders === 1 ? '' : 's'} created`]
              : []),
            ...(preview.widgetPages > 0
              ? [`${preview.widgetPages} widget page${preview.widgetPages === 1 ? '' : 's'} kept`]
              : [])
          ]}
          doneMessage={`Done! ${device.name} is sorted ${preset.sorted}.`}
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
