import type { AppItem, Layout, LayoutItem } from '../types'
import { itemSpan } from './place'
import { pageCapacity } from './grid'

export type Issue =
  | { code: 'missing-app'; bundleId: string }
  | { code: 'duplicate-app'; bundleId: string }
  | { code: 'unknown-app'; bundleId: string }
  | { code: 'empty-folder'; name: string }
  | { code: 'page-over-capacity'; page: number }
  | { code: 'dock-over-max'; count: number }
  | { code: 'widget-changed' }

const appsOf = (items: LayoutItem[]): AppItem[] =>
  items.flatMap((item) =>
    item.kind === 'app' ? [item] : item.kind === 'folder' ? item.pages.flat() : []
  )

// Widgets and unrecognised items (web clips…) must come through byte for byte.
const untouchedRaws = (layout: Layout): string[] =>
  [...layout.dock, ...layout.pages.flat()]
    .filter((item) => item.kind === 'widget' || item.kind === 'other')
    .map((item) => JSON.stringify(item.raw))
    .sort()

// Checks `after` before anything is written to the phone. `removed`: apps deliberately left off the
// home screen (sent to the App Library). An empty result means safe to apply.
export function validateLayout(before: Layout, after: Layout, removed: string[] = []): Issue[] {
  const issues: Issue[] = []
  const all = [...after.dock, ...after.pages.flat()]

  const seen = new Map<string, number>()
  for (const app of appsOf(all)) seen.set(app.bundleId, (seen.get(app.bundleId) ?? 0) + 1)
  const wanted = new Set(appsOf([...before.dock, ...before.pages.flat()]).map((a) => a.bundleId))
  for (const id of removed) wanted.delete(id)
  for (const id of wanted) if (!seen.has(id)) issues.push({ code: 'missing-app', bundleId: id })
  for (const [id, n] of seen) {
    if (n > 1) issues.push({ code: 'duplicate-app', bundleId: id })
    if (!wanted.has(id) && !removed.includes(id)) issues.push({ code: 'unknown-app', bundleId: id })
  }

  for (const item of all) {
    if (item.kind === 'folder' && item.pages.every((p) => p.length === 0)) {
      issues.push({ code: 'empty-folder', name: item.name })
    }
  }

  // Cells, not items: a medium widget takes 8. Counting cells needs no guess about where things sit.
  after.pages.forEach((page, i) => {
    const cells = page.reduce((n, item) => {
      const { w, h } = itemSpan(item, after.grid)
      return n + w * h
    }, 0)
    if (cells > pageCapacity(after.grid)) issues.push({ code: 'page-over-capacity', page: i + 1 })
  })

  if (after.dock.length > after.grid.dockMax) {
    issues.push({ code: 'dock-over-max', count: after.dock.length })
  }

  const a = untouchedRaws(before)
  const b = untouchedRaws(after)
  if (a.length !== b.length || a.some((raw, i) => raw !== b[i]))
    issues.push({ code: 'widget-changed' })
  return issues
}
