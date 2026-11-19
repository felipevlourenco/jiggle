import type { AppItem, FolderItem, Layout, LayoutItem } from '../types'
import { pageCapacity } from './grid'
import { itemSpan } from './place'
import { compareNames } from './sort'

const cellsOf = (items: LayoutItem[], grid: Layout['grid']): number =>
  items.reduce((n, item) => {
    const { w, h } = itemSpan(item, grid)
    return n + w * h
  }, 0)

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
  const cells = (items: LayoutItem[]): number => cellsOf(items, grid)
  const added = [...now.values()].filter((a) => !placed.has(a.bundleId)).sort(compareNames)
  for (const app of added) {
    const last = pages[pages.length - 1]
    if (last && cells(last) < pageCapacity(grid)) last.push(app)
    else pages.push([app])
  }
  return { dock, pages, grid }
}

export interface CopyResult {
  layout: Layout
  shared: number // apps on both devices: they follow the source's order
  targetOnly: number // apps only the target has: added at the end, A–Z
  sourceOnly: number // apps only the source has: skipped
}

const isMovable = (item: LayoutItem): item is AppItem | FolderItem =>
  item.kind === 'app' || item.kind === 'folder'

// One device's arrangement on another (an iPhone's on an iPad, or the other way round).
// Apps are matched by bundle ID; the target's own dict is used. The source's folders are rebuilt with the apps
// the target has, and its page breaks are forgotten: the sequence is dealt into the target's pages, which are
// as big as the target's grid. Target-only apps follow at the end. The target keeps its dock and its widgets:
// keep-pages leaves a page with a widget exactly as it is, sort-around keeps only the widgets there and deals
// apps into the rest of the page. The target's own folders dissolve (their apps are placed like any other).
export function copyLayout(
  source: Layout,
  target: Layout,
  opts: { widgetMode: 'keep-pages' | 'sort-around' }
): CopyResult {
  const grid = target.grid
  const size = pageCapacity(grid)
  const mine = new Map(appsOf([...target.dock, ...target.pages.flat()]).map((a) => [a.bundleId, a]))
  const carriers = target.pages.map((page) => page.some((item) => !isMovable(item)))

  // Where the target keeps an app: its dock, and (keep-pages) a page that carries a widget.
  const stays = new Set(appsOf(target.dock).map((a) => a.bundleId))
  if (opts.widgetMode === 'keep-pages') {
    target.pages.forEach((page, i) => {
      if (carriers[i]) appsOf(page).forEach((a) => stays.add(a.bundleId))
    })
  }

  const placed = new Set<string>()
  const take = (app: AppItem): AppItem[] => {
    const own = mine.get(app.bundleId)
    if (!own || stays.has(app.bundleId) || placed.has(app.bundleId)) return []
    placed.add(app.bundleId)
    return [own]
  }
  // The source's dock first, then its pages in order. Its widgets and other items stay behind.
  const sequence = [...source.dock, ...source.pages.flat()].flatMap<LayoutItem>((item) => {
    if (item.kind === 'app') return take(item)
    if (item.kind !== 'folder') return []
    const pages = item.pages.map((page) => page.flatMap(take)).filter((page) => page.length > 0)
    return pages.length > 0 ? [{ ...item, id: `copy:${item.id}`, pages }] : []
  })
  const added = [...mine.values()]
    .filter((a) => !stays.has(a.bundleId) && !placed.has(a.bundleId))
    .sort(compareNames)
  const queue: LayoutItem[] = [...sequence, ...added]

  const fill = (page: LayoutItem[]): LayoutItem[] => {
    while (queue.length > 0 && cellsOf(page, grid) < size) page.push(queue.shift()!)
    return page
  }
  const pages: LayoutItem[][] = []
  target.pages.forEach((page, i) => {
    if (!carriers[i]) {
      const dealt = fill([])
      if (dealt.length > 0) pages.push(dealt)
    } else if (opts.widgetMode === 'keep-pages') pages.push(page)
    else pages.push(fill(page.filter((item) => !isMovable(item))))
  })
  while (queue.length > 0) pages.push(fill([]))

  const sourceApps = new Set(
    appsOf([...source.dock, ...source.pages.flat()]).map((a) => a.bundleId)
  )
  const shared = [...sourceApps].filter((id) => mine.has(id)).length
  return {
    layout: { dock: target.dock, pages, grid },
    shared,
    targetOnly: mine.size - shared,
    sourceOnly: sourceApps.size - shared
  }
}
