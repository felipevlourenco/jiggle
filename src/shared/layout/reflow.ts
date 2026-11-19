import type { AppItem, Layout, LayoutItem } from '../types'
import { pageCapacity } from './grid'
import { itemSpan } from './place'
import { compareNames } from './sort'

const appsOf = (items: LayoutItem[]): AppItem[] =>
  items.flatMap((item) =>
    item.kind === 'app' ? [item] : item.kind === 'folder' ? item.pages.flat() : []
  )

// The layout to write when switching to `saved`: its arrangement, fitted to the apps the phone has now.
// Apps gone from the home screen since are dropped (a folder or page left empty goes with them); apps
// that weren't in `saved` are added at the end, A–Z, on the last page or on new pages.
// Widgets and other items come from `saved`, like a restore. An app keeps the phone's current dict.
// ponytail: an app that sits in the App Library now isn't brought back, even if `saved` had it on a page.
export function reflow(saved: Layout, current: Layout): Layout {
  const now = new Map(
    appsOf([...current.dock, ...current.pages.flat()]).map((a) => [a.bundleId, a])
  )
  const placed = new Set<string>()
  const take = (app: AppItem): AppItem[] => {
    const fresh = now.get(app.bundleId)
    if (!fresh || placed.has(app.bundleId)) return []
    placed.add(app.bundleId)
    return [fresh]
  }
  const fromList = (items: LayoutItem[]): LayoutItem[] =>
    items.flatMap<LayoutItem>((item) => {
      if (item.kind === 'app') return take(item)
      if (item.kind !== 'folder') return [item]
      const pages = item.pages.map((page) => page.flatMap(take)).filter((page) => page.length > 0)
      return pages.length > 0 ? [{ ...item, pages }] : []
    })

  const dock = fromList(saved.dock)
  const pages = saved.pages.map(fromList).filter((page) => page.length > 0)

  const grid = current.grid
  const cells = (items: LayoutItem[]): number =>
    items.reduce((n, item) => {
      const { w, h } = itemSpan(item, grid)
      return n + w * h
    }, 0)
  const added = [...now.values()].filter((a) => !placed.has(a.bundleId)).sort(compareNames)
  for (const app of added) {
    const last = pages[pages.length - 1]
    if (last && cells(last) < pageCapacity(grid)) last.push(app)
    else pages.push([app])
  }
  return { dock, pages, grid }
}
