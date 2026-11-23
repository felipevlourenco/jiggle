import type { Layout, LayoutItem } from '../types'
// Explicit extension: scripts/engine-preview.ts runs this file with plain Node.
import { appLocations } from './locations.ts'

// Where each app and folder sits: "dock:2" or "3:5" (page, slot). Apps inside folders move with their folder.
function positions(layout: Layout): Map<string, string> {
  const at = new Map<string, string>()
  const visit = (items: Layout['dock'], where: (slot: number) => string): void =>
    items.forEach((item, slot) => {
      if (item.kind === 'app' || item.kind === 'folder') at.set(item.id, where(slot))
    })
  visit(layout.dock, (slot) => `dock:${slot}`)
  layout.pages.forEach((page, p) => visit(page, (slot) => `${p + 1}:${slot}`))
  return at
}

// The apps and folders that end up somewhere else.
// `after` must come from `before` (same item ids), as sortLayout's result does.
export function movedIds(before: Layout, after: Layout): Set<string> {
  const was = positions(before)
  const moved = new Set<string>()
  for (const [id, where] of positions(after)) if (was.get(id) !== where) moved.add(id)
  return moved
}

export const countMoved = (before: Layout, after: Layout): number => movedIds(before, after).size

// What differs between two layouts of the same phone, for people to read (History > Compare). Apps are matched by
// bundle ID, so it works between a backup and the phone as it is now. Read only.
export interface AppMove {
  bundleId: string
  name: string
  from: string // "Page 2, position 3", "Dock, position 1" or "Folder 'Travel' · Page 4, position 2"
  to: string
}
export interface AppPresence {
  bundleId: string
  name: string
  at: string
}
export interface FolderChange {
  kind: 'added' | 'removed' | 'renamed'
  name: string
  to?: string // the new name, when renamed
}
export interface LayoutDiff {
  moved: AppMove[]
  added: AppPresence[] // on the Home Screen in `after` only
  removed: AppPresence[] // on the Home Screen in `before` only: in the App Library now, or uninstalled
  folders: FolderChange[]
  pages: { before: number; after: number }
}

type Spot = { name: string; where: string; slot: number }

// Where each app sits, with its slot on the page (or inside its folder, counting across the folder's pages).
function spots(layout: Layout, renames: Map<string, string>): Map<string, Spot> {
  const where = appLocations(layout)
  const slots = new Map<string, number>()
  const visit = (items: LayoutItem[]): void =>
    items.forEach((item, slot) => {
      if (item.kind === 'app') slots.set(item.bundleId, slot)
      else if (item.kind === 'folder') item.pages.flat().forEach((a, i) => slots.set(a.bundleId, i))
    })
  visit(layout.dock)
  layout.pages.forEach(visit)
  const out = new Map<string, Spot>()
  for (const [id, { name, location }] of where) {
    let text = location
    for (const [from, to] of renames) text = text.replace(`Folder '${from}'`, `Folder '${to}'`)
    out.set(id, { name, where: text, slot: slots.get(id) ?? 0 })
  }
  return out
}

const folderApps = (layout: Layout): { name: string; ids: Set<string> }[] =>
  [...layout.dock, ...layout.pages.flat()].flatMap((i) =>
    i.kind === 'folder'
      ? [{ name: i.name, ids: new Set(i.pages.flat().map((a) => a.bundleId)) }]
      : []
  )

// Folders are matched by the apps they share: the one with the most in common is "the same folder".
// ponytail: a folder renamed and emptied at once shows as removed plus added; fine for a read-only summary.
function compareFolders(
  before: Layout,
  after: Layout
): { changes: FolderChange[]; renames: Map<string, string> } {
  const left = folderApps(after).map((f) => ({ ...f, matched: false }))
  const changes: FolderChange[] = []
  const renames = new Map<string, string>()
  for (const old of folderApps(before)) {
    let best: (typeof left)[number] | undefined
    let bestShared = 0
    for (const candidate of left) {
      if (candidate.matched) continue
      const shared = [...old.ids].filter((id) => candidate.ids.has(id)).length
      if (shared > bestShared) [best, bestShared] = [candidate, shared]
    }
    if (!best) changes.push({ kind: 'removed', name: old.name })
    else {
      best.matched = true
      if (best.name !== old.name) {
        changes.push({ kind: 'renamed', name: old.name, to: best.name })
        renames.set(old.name, best.name)
      }
    }
  }
  for (const f of left) if (!f.matched) changes.push({ kind: 'added', name: f.name })
  return { changes, renames }
}

export function compareLayouts(before: Layout, after: Layout): LayoutDiff {
  const { changes, renames } = compareFolders(before, after)
  const was = spots(before, renames)
  const now = spots(after, new Map())
  const describe = (s: Spot): string => `${s.where}, position ${s.slot + 1}`
  const moved: AppMove[] = []
  const added: AppPresence[] = []
  const removed: AppPresence[] = []
  for (const [bundleId, to] of now) {
    const from = was.get(bundleId)
    if (!from) added.push({ bundleId, name: to.name, at: describe(to) })
    else if (from.where !== to.where || from.slot !== to.slot)
      moved.push({ bundleId, name: to.name, from: describe(from), to: describe(to) })
  }
  for (const [bundleId, from] of was) {
    if (!now.has(bundleId)) removed.push({ bundleId, name: from.name, at: describe(from) })
  }
  return {
    moved,
    added,
    removed,
    folders: changes,
    pages: { before: before.pages.length, after: after.pages.length }
  }
}

export const hasChanges = (d: LayoutDiff): boolean =>
  d.moved.length + d.added.length + d.removed.length + d.folders.length > 0 ||
  d.pages.before !== d.pages.after
