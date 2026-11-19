import type { AppItem, FolderItem, IconColor, Layout, LayoutItem, Pins } from '../types'
import { compareColors } from './color.ts'
// Explicit extension: scripts/engine-preview.ts runs this file with plain Node.
import { pageCapacity } from './grid.ts'

export interface SortOptions {
  by: 'name' | 'category' | 'color'
  // keep-pages: a page holding a widget (or anything unrecognised) stays exactly as it is.
  // sort-around: apps and folders leave those pages; only the widgets stay on them.
  widgetMode: 'keep-pages' | 'sort-around'
  // Needed for by: 'category'. Apple apps are "Apple", apps the App Store doesn't know "Unknown".
  categoryOf?: (bundleId: string) => string
  // Needed for by: 'color'. null: the icon hasn't been read; it sorts with the neutrals.
  colorOf?: (bundleId: string) => IconColor | null
  // Pinned apps and page 1 stay exactly where they are (see sortInPlace).
  pins?: Pins
}

type Movable = AppItem | FolderItem
const isMovable = (item: LayoutItem): item is Movable =>
  item.kind === 'app' || item.kind === 'folder'

// A–Z the way a person reads it: case and accents don't matter, and the invisible direction
// marks some apps put in their names (e.g. "‎WhatsApp") don't push them to the end.
const collator = new Intl.Collator('en', { sensitivity: 'base' })
const nameOf = (item: Movable): string => item.name.replace(/\p{Cf}/gu, '').trim()

// Folders are sorted as single items by their name. In category and color mode they come first.
function compare(a: Movable, b: Movable, opts: SortOptions): number {
  if (opts.by === 'category') {
    const category = (i: Movable): string =>
      i.kind === 'folder' ? '' : (opts.categoryOf?.(i.bundleId) ?? '')
    const byCategory = collator.compare(category(a), category(b))
    if (byCategory) return byCategory
  }
  if (opts.by === 'color' && (a.kind === 'app' || b.kind === 'app')) {
    // Folders have no color: they go first, by name below.
    if (a.kind !== 'app') return -1
    if (b.kind !== 'app') return 1
    const byColor = compareColors(
      opts.colorOf?.(a.bundleId) ?? null,
      opts.colorOf?.(b.bundleId) ?? null
    )
    if (byColor) return byColor
  }
  return collator.compare(nameOf(a), nameOf(b))
}

// The dock is never touched. Home screen pages are re-sorted and packed from the top left:
// pages that must stay as they are come first, then the sorted pages, full ones first.
// ponytail: untouched pages move to the front, like the POC; keep their page numbers if that surprises people.
export function sortLayout(layout: Layout, opts: SortOptions): Layout {
  if (opts.pins && (opts.pins.page1 || opts.pins.apps.length)) return sortInPlace(layout, opts)
  const frozen: LayoutItem[][] = []
  const movable: Movable[] = []
  for (const page of layout.pages) {
    if (page.every(isMovable)) movable.push(...page)
    else if (opts.widgetMode === 'sort-around') {
      movable.push(...page.filter(isMovable))
      frozen.push(page.filter((item) => !isMovable(item)))
    } else frozen.push(page)
  }
  movable.sort((a, b) => compare(a, b, opts)) // stable: equal names keep their order

  const size = pageCapacity(layout.grid)
  const sorted: LayoutItem[][] = []
  for (let i = 0; i < movable.length; i += size) sorted.push(movable.slice(i, i + size))
  return { ...layout, pages: [...frozen, ...sorted] }
}

// With pins every page keeps its number and its size: locked pages stay as they are, and the
// movable items are dealt back, sorted, into the free slots of the others. A pinned app simply
// isn't a free slot. Pins on apps inside folders, or on a widget page when widgets are kept, do nothing.
// ponytail: unlike the no-pin sort, partly filled pages stay partly filled; repack if that surprises people.
function sortInPlace(layout: Layout, opts: SortOptions): Layout {
  const pins = opts.pins!
  const pinned = new Set(pins.apps)
  const free = (item: LayoutItem): item is Movable =>
    isMovable(item) && !(item.kind === 'app' && pinned.has(item.bundleId))
  const locked = (page: LayoutItem[], i: number): boolean =>
    (i === 0 && pins.page1) || (opts.widgetMode === 'keep-pages' && !page.every(isMovable))
  const movable = layout.pages.flatMap((page, i) => (locked(page, i) ? [] : page.filter(free)))
  movable.sort((a, b) => compare(a, b, opts))
  const queue = [...movable]
  const pages = layout.pages.map((page, i) =>
    locked(page, i) ? page : page.map((item) => (free(item) ? queue.shift()! : item))
  )
  return { ...layout, pages }
}
