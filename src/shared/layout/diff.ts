import type { Layout } from '../types'

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
