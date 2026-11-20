import type { AppItem, FolderItem, Layout, LayoutItem } from '../types'
import { pageCapacity } from './grid'
import { itemSpan } from './place'

// Where an item can be dropped. `index` is the place the item ends up at in that list (like arrayMove):
// dropping on an icon puts the dragged item in that icon's slot and shifts the rest along.
export type DropTarget =
  | { zone: 'page'; page: number; index: number }
  | { zone: 'dock'; index: number }
  | { zone: 'folder'; folderId: string; index?: number } // index: a slot inside the folder, to reorder; none: the end

export type Place =
  | { zone: 'dock'; index: number }
  | { zone: 'page'; page: number; index: number }
  | { zone: 'folder'; folderId: string; folderPage: number; index: number }

export const FOLDER_PAGE_MAX = 9 // a folder page is 3 × 3

const movable = (item: LayoutItem): item is AppItem | FolderItem =>
  item.kind === 'app' || item.kind === 'folder'

// Where an app or folder sits now, or null.
export function locate(layout: Layout, id: string): Place | null {
  const top = (items: LayoutItem[]): number => items.findIndex((i) => i.id === id)
  const d = top(layout.dock)
  if (d >= 0) return { zone: 'dock', index: d }
  for (const [page, items] of layout.pages.entries()) {
    const index = top(items)
    if (index >= 0) return { zone: 'page', page, index }
    for (const item of items) {
      if (item.kind !== 'folder') continue
      for (const [folderPage, apps] of item.pages.entries()) {
        const at = apps.findIndex((a) => a.id === id)
        if (at >= 0) return { zone: 'folder', folderId: item.id, folderPage, index: at }
      }
    }
  }
  for (const item of layout.dock) {
    if (item.kind !== 'folder') continue
    for (const [folderPage, apps] of item.pages.entries()) {
      const at = apps.findIndex((a) => a.id === id)
      if (at >= 0) return { zone: 'folder', folderId: item.id, folderPage, index: at }
    }
  }
  return null
}

export function findItem(layout: Layout, id: string): AppItem | FolderItem | null {
  for (const item of [...layout.dock, ...layout.pages.flat()]) {
    if (item.id === id && movable(item)) return item
    if (item.kind === 'folder') {
      const app = item.pages.flat().find((a) => a.id === id)
      if (app) return app
    }
  }
  return null
}

const without = <T extends { id: string }>(list: T[], id: string): T[] =>
  list.filter((x) => x.id !== id)
const insertAt = <T>(list: T[], index: number, item: T): T[] => {
  const at = Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, at), item, ...list.slice(at)]
}

// Takes the item out of wherever it is. A folder left with no apps goes too, like on the phone.
function remove(layout: Layout, id: string): Layout {
  const fromList = (items: LayoutItem[]): LayoutItem[] =>
    without(items, id).flatMap<LayoutItem>((item) => {
      if (item.kind !== 'folder') return [item]
      const pages = item.pages.map((p) => without(p, id)).filter((p) => p.length > 0)
      return pages.length > 0 ? [{ ...item, pages }] : []
    })
  return { ...layout, dock: fromList(layout.dock), pages: layout.pages.map(fromList) }
}

const cells = (items: LayoutItem[], grid: Layout['grid']): number =>
  items.reduce((n, item) => {
    const { w, h } = itemSpan(item, grid)
    return n + w * h
  }, 0)

// Moves an app or folder. Returns the new layout, the same layout when nothing changes, or null when the
// move isn't allowed (a full page, a full dock, a full folder, a folder inside a folder).
export function moveItem(layout: Layout, id: string, target: DropTarget): Layout | null {
  const item = findItem(layout, id)
  if (!item) return null
  const from = locate(layout, id)
  if (!from) return null
  const rest = remove(layout, id)

  if (target.zone === 'folder') {
    if (item.kind !== 'app' || target.folderId === id) return null
    if (target.index !== undefined) {
      // A slot inside the folder: only for an app already in it (reordering). Pages are rebuilt, 9 to a page.
      if (from.zone !== 'folder' || from.folderId !== target.folderId) return null
      const reorder = (list: LayoutItem[]): LayoutItem[] =>
        list.map((it) => {
          if (it.kind !== 'folder' || it.id !== target.folderId) return it
          const flat = insertAt(it.pages.flat(), target.index!, item)
          const pages = Array.from({ length: Math.ceil(flat.length / FOLDER_PAGE_MAX) }, (_, i) =>
            flat.slice(i * FOLDER_PAGE_MAX, (i + 1) * FOLDER_PAGE_MAX)
          )
          return { ...it, pages }
        })
      const next = { ...rest, dock: reorder(rest.dock), pages: rest.pages.map(reorder) }
      return layoutsEqual(next, layout) ? layout : next
    }
    let placed = false
    const into = (items: LayoutItem[]): LayoutItem[] =>
      items.map((it) => {
        if (it.kind !== 'folder' || it.id !== target.folderId) return it
        const pages = it.pages.map((p) => [...p])
        const last = pages[pages.length - 1]
        if (!last || last.length >= FOLDER_PAGE_MAX) return it // full
        last.push(item)
        placed = true
        return { ...it, pages }
      })
    const next = { ...rest, dock: into(rest.dock), pages: rest.pages.map(into) }
    // Already in that folder: nothing to do.
    if (from.zone === 'folder' && from.folderId === target.folderId) return layout
    return placed ? next : null
  }

  if (target.zone === 'dock') {
    const dock = insertAt(rest.dock, target.index, item)
    if (dock.length > layout.grid.dockMax) return null
    const same = from.zone === 'dock' && dock.every((it, i) => it === layout.dock[i])
    return same ? layout : { ...rest, dock }
  }

  const page = rest.pages[target.page]
  if (!page) return null
  const list = insertAt(page, target.index, item)
  if (cells(list, layout.grid) > pageCapacity(layout.grid)) return null
  const pages = rest.pages.map((p, i) => (i === target.page ? list : p))
  const same =
    from.zone === 'page' &&
    from.page === target.page &&
    list.every((it, i) => it === layout.pages[target.page]![i])
  return same ? layout : { ...rest, pages }
}

const sameItems = (a: LayoutItem[], b: LayoutItem[]): boolean =>
  a.length === b.length &&
  a.every((it, i) => {
    const other = b[i]
    if (it === other) return true
    return (
      it.kind === 'folder' &&
      other?.kind === 'folder' &&
      it.id === other.id &&
      it.name === other.name &&
      it.pages.length === other.pages.length &&
      it.pages.every(
        (p, j) =>
          p.length === other.pages[j]!.length && p.every((app, k) => app === other.pages[j]![k])
      )
    )
  })
const layoutsEqual = (a: Layout, b: Layout): boolean =>
  sameItems(a.dock, b.dock) &&
  a.pages.length === b.pages.length &&
  a.pages.every((p, i) => sameItems(p, b.pages[i]!))

// Renames a folder. Null when the name is empty or there is no such folder; the same layout when unchanged.
export function renameFolder(layout: Layout, folderId: string, name: string): Layout | null {
  const clean = name.trim()
  if (!clean) return null
  let found = false
  const rename = (list: LayoutItem[]): LayoutItem[] =>
    list.map((it) => {
      if (it.kind !== 'folder' || it.id !== folderId) return it
      found = true
      return it.name === clean ? it : { ...it, name: clean, raw: { ...it.raw, displayName: clean } }
    })
  const next = { ...layout, dock: rename(layout.dock), pages: layout.pages.map(rename) }
  return found ? (layoutsEqual(next, layout) ? layout : next) : null
}

export const NEW_FOLDER_NAME = 'New Folder'

// Drops an app onto another app: a folder takes the target's place and holds the target, then the dropped
// app. Both must be apps, and the target must not already be inside a folder.
export function makeFolder(layout: Layout, appId: string, ontoId: string): Layout | null {
  const app = findItem(layout, appId)
  const onto = findItem(layout, ontoId)
  const at = locate(layout, ontoId)
  if (app?.kind !== 'app' || onto?.kind !== 'app' || appId === ontoId) return null
  if (!at || at.zone === 'folder') return null
  const rest = remove(layout, appId)
  const folder: FolderItem = {
    kind: 'folder',
    id: `folder:new-${app.id}`,
    name: NEW_FOLDER_NAME,
    pages: [[onto, app]],
    raw: { displayName: NEW_FOLDER_NAME, iconLists: [], listType: 'folder' }
  }
  const swap = (list: LayoutItem[]): LayoutItem[] =>
    list.map((it) => (it.id === ontoId ? folder : it))
  return { ...rest, dock: swap(rest.dock), pages: rest.pages.map(swap) }
}

// For pushing: the phone drops empty pages, so don't send them.
export const compact = (layout: Layout): Layout => ({
  ...layout,
  pages: layout.pages.filter((p) => p.length > 0)
})

// ---- undo / redo ----

export interface Draft {
  base: Layout // what the phone has
  present: Layout
  past: Layout[]
  future: Layout[]
}

export const startDraft = (base: Layout): Draft => ({ base, present: base, past: [], future: [] })

export function commit(draft: Draft, next: Layout): Draft {
  if (next === draft.present) return draft
  return { ...draft, present: next, past: [...draft.past, draft.present], future: [] }
}
export function undo(draft: Draft): Draft {
  const previous = draft.past[draft.past.length - 1]
  if (!previous) return draft
  return {
    ...draft,
    present: previous,
    past: draft.past.slice(0, -1),
    future: [draft.present, ...draft.future]
  }
}
export function redo(draft: Draft): Draft {
  const [next, ...future] = draft.future
  if (!next) return draft
  return { ...draft, present: next, past: [...draft.past, draft.present], future }
}
