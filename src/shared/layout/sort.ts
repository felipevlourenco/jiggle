import type { AppItem, FolderItem, IconColor, Layout, LayoutItem } from '../types'
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
