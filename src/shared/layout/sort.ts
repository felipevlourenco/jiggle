import type { AppItem, FolderItem, IconColor, Layout, LayoutItem, Pins } from '../types'
import { compareColors, familyOf, pageGroupOf, type ColorFamily } from './color.ts'
import { foldBy, type FolderRule } from './folders.ts'
// Explicit extension: scripts/engine-preview.ts runs this file with plain Node.
import { pageCapacity } from './grid.ts'

export interface SortOptions {
  by: 'name' | 'category' | 'color'
  // keep-pages: a page holding a widget (or anything unrecognised) stays exactly as it is.
  // sort-around: apps and folders leave those pages; only the widgets stay on them.
  // fill: widget pages are sorted too, with every widget where it was, and the pages without widgets are
  // packed full around them. (With pins, every page keeps its size instead: see sortInPlace.)
  widgetMode: 'keep-pages' | 'sort-around' | 'fill'
  // Needed for by: 'category'. Apple apps are "Apple", apps the App Store doesn't know "Unknown".
  categoryOf?: (bundleId: string) => string
  // Needed for by: 'color'. null: the icon hasn't been read; it sorts with the neutrals.
  colorOf?: (bundleId: string) => IconColor | null
  // With by: 'color': the order of the color families (default: the rainbow, then white, grey, black).
  colorOrder?: readonly ColorFamily[]
  // Pinned apps and page 1 stay exactly where they are (see sortInPlace).
  pins?: Pins
  // Loose apps gather into one folder per category, developer or first letter (2 or more apps each).
  // Needs categoryOf or developerOf to match; an app without a developer (null) stays loose.
  folders?: FolderRule
  developerOf?: (bundleId: string) => string | null
  // Each color family or category starts on a new page (see canSortPerPage). Folders share their own pages, first.
  perPage?: boolean
}

// iOS documents no limit; 15 is what people report. ponytail: unverified on a real phone.
export const MAX_PAGES = 15

// A–Z would give a page per letter; 'fill' could move a widget when a group runs out; and with category
// folders almost every category is already one folder.
export const canSortPerPage = (opts: Pick<SortOptions, 'by' | 'widgetMode' | 'folders'>): boolean =>
  opts.by !== 'name' &&
  opts.widgetMode !== 'fill' &&
  !(opts.by === 'category' && opts.folders === 'category')

type Movable = AppItem | FolderItem
const isMovable = (item: LayoutItem): item is Movable =>
  item.kind === 'app' || item.kind === 'folder'

// A–Z the way a person reads it: case and accents don't matter, and the invisible direction
// marks some apps put in their names (e.g. "‎WhatsApp") don't push them to the end.
const collator = new Intl.Collator('en', { sensitivity: 'base' })
const nameOf = (item: { name: string }): string => item.name.replace(/\p{Cf}/gu, '').trim()

// Also used to place apps added to a layout (reflow).
export const compareNames = (a: { name: string }, b: { name: string }): number =>
  collator.compare(nameOf(a), nameOf(b))

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
      opts.colorOf?.(b.bundleId) ?? null,
      opts.colorOrder
    )
    if (byColor) return byColor
  }
  return compareNames(a, b)
}

const withFolders = (movable: Movable[], opts: SortOptions): Movable[] =>
  opts.folders ? foldBy(movable, opts.folders, opts) : movable

// The dock is never touched. Home screen pages are re-sorted and packed from the top left:
// pages that must stay as they are come first, then the sorted pages, full ones first.
// ponytail: untouched pages move to the front, like the POC; keep their page numbers if that surprises people.
export function sortLayout(layout: Layout, opts: SortOptions): Layout {
  if (opts.perPage && canSortPerPage(opts)) return sortPerPage(layout, opts)
  if (opts.pins?.page1 || opts.pins?.apps.length) return sortInPlace(layout, opts)
  if (opts.widgetMode === 'fill') return sortFill(layout, opts)
  const frozen: LayoutItem[][] = []
  const movable: Movable[] = []
  for (const page of layout.pages) {
    if (page.every(isMovable)) movable.push(...page)
    else if (opts.widgetMode === 'sort-around') {
      movable.push(...page.filter(isMovable))
      frozen.push(page.filter((item) => !isMovable(item)))
    } else frozen.push(page)
  }
  const ordered = withFolders(movable, opts).sort((a, b) => compare(a, b, opts)) // stable: equal names keep their order

  const size = pageCapacity(layout.grid)
  const sorted: LayoutItem[][] = []
  for (let i = 0; i < ordered.length; i += size) sorted.push(ordered.slice(i, i + size))
  return { ...layout, pages: [...frozen, ...sorted] }
}

// 'fill': pages in order take the sorted items. A page with a widget keeps its widget where it is and has as many
// free slots as it had apps; any other page is filled up to capacity, so the last pages empty out and go.
// ponytail: a widget page after the point where the apps run out loses its trailing apps, so its widget moves up.
function sortFill(layout: Layout, opts: SortOptions): Layout {
  const movable = layout.pages.flatMap((page) => page.filter(isMovable))
  const queue = withFolders(movable, opts).sort((a, b) => compare(a, b, opts))
  const size = pageCapacity(layout.grid)
  const pages = layout.pages
    .map((page) =>
      page.every(isMovable)
        ? queue.splice(0, size)
        : page.flatMap<LayoutItem>((item) => (isMovable(item) ? queue.splice(0, 1) : [item]))
    )
    .filter((page, i) => page.length > 0 || layout.pages[i]!.length === 0)
  while (queue.length) pages.push(queue.splice(0, size))
  return { ...layout, pages }
}

// With pins every page keeps its number and its size: locked pages stay as they are, and the
// movable items are dealt back, sorted, into the free slots of the others. A pinned app simply
// isn't a free slot. Pins on apps inside folders, or on a widget page when widgets are kept, do nothing.
// ponytail: unlike the no-pin sort, partly filled pages stay partly filled; repack if that surprises people.
function sortInPlace(layout: Layout, opts: SortOptions): Layout {
  const pins = opts.pins ?? { apps: [], page1: false }
  const pinned = new Set(pins.apps)
  const free = (item: LayoutItem): item is Movable =>
    isMovable(item) && !(item.kind === 'app' && pinned.has(item.bundleId))
  const locked = (page: LayoutItem[], i: number): boolean =>
    (i === 0 && pins.page1) || (opts.widgetMode === 'keep-pages' && !page.every(isMovable))
  const movable = layout.pages.flatMap((page, i) => (locked(page, i) ? [] : page.filter(free)))
  const queue = withFolders(movable, opts).sort((a, b) => compare(a, b, opts))
  // Folding leaves fewer items than slots: the slots at the end go, and a page left empty goes with them.
  // ponytail: a pinned app after such gaps moves up with them; the pin only keeps its page then.
  const pages = layout.pages
    .map((page, i) =>
      locked(page, i)
        ? page
        : page.flatMap<LayoutItem>((item) => (free(item) ? queue.splice(0, 1) : [item]))
    )
    .filter((page, i) => page.length > 0 || layout.pages[i]!.length === 0)
  return { ...layout, pages }
}

// What must share a page. The sort keeps each group's items next to each other.
function groupOf(item: Movable, opts: SortOptions): string {
  if (item.kind === 'folder') return '\0folders'
  return opts.by === 'color'
    ? pageGroupOf(familyOf(opts.colorOf?.(item.bundleId) ?? null))
    : (opts.categoryOf?.(item.bundleId) ?? '').toLowerCase()
}

// One group per page, a big group carrying over. Without app pins, the pages that stay (a pinned page 1,
// widget pages) come first. With app pins, those pages and every pinned app keep their page number,
// and the groups are dealt around them.
// ponytail: a pinned app moves up if too few apps come before it, or if earlier pages don't exist.
function sortPerPage(layout: Layout, opts: SortOptions): Layout {
  const pinned = new Set(opts.pins?.apps)
  const isPinned = (item: LayoutItem): boolean => item.kind === 'app' && pinned.has(item.bundleId)
  const keepNumbers = pinned.size > 0
  const stays = new Map<number, LayoutItem[]>() // page number → a page that is already complete
  const held = new Map<number, { item: LayoutItem; at: number }[]>() // page number → its pinned apps
  const movable: Movable[] = []
  const keep = (i: number, page: LayoutItem[]): void => {
    stays.set(keepNumbers ? i : stays.size, page)
  }
  layout.pages.forEach((page, i) => {
    const widgets = !page.every(isMovable)
    if ((i === 0 && opts.pins?.page1) || (widgets && opts.widgetMode === 'keep-pages')) {
      keep(i, page)
      return
    }
    movable.push(...page.filter(isMovable).filter((item) => !isPinned(item)))
    if (widgets)
      keep(
        i,
        page.filter((item) => !isMovable(item) || isPinned(item))
      )
    else {
      const here = page.flatMap((item, at) => (isPinned(item) ? [{ item, at }] : []))
      if (here.length) held.set(i, here)
    }
  })
  const queue = withFolders(movable, opts).sort((a, b) => compare(a, b, opts))

  const size = pageCapacity(layout.grid)
  const last = Math.max(-1, ...stays.keys(), ...held.keys())
  const pages: LayoutItem[][] = []
  for (let i = 0; queue.length > 0 || i <= last; i++) {
    const fixed = stays.get(i)
    if (fixed) {
      pages.push(fixed)
      continue
    }
    const here = held.get(i) ?? []
    const page: LayoutItem[] = []
    const group = queue[0] && groupOf(queue[0], opts)
    while (queue[0] && page.length < size - here.length && groupOf(queue[0], opts) === group) {
      page.push(queue.shift()!)
    }
    for (const { item, at } of here) page.splice(at, 0, item)
    if (page.length) pages.push(page)
  }
  return { ...layout, pages }
}
