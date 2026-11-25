import type { AppItem, Layout, LayoutItem } from '../types'
import { moveItem } from './edit'
import { findNewApps, type NewAppIssue, type NewApps } from './newApps'

// Clutter on the home screen pages that can be tidied without changing what is where.
export type CleanupIssue =
  | { id: string; kind: 'empty-page'; page: number } // `page`: 0-based
  | {
      id: string
      kind: 'one-app-folder'
      page: number
      folderId: string
      name: string
      app: AppItem
    }
  | NewAppIssue

// Empty pages, folders holding a single app, and (given which apps are new) new apps with a folder waiting.
// In page order. The dock is left alone.
export function findCleanup(layout: Layout, newApps?: NewApps): CleanupIssue[] {
  const issues: CleanupIssue[] = []
  const moves = newApps ? findNewApps(layout, newApps) : []
  // A folder about to get a new app isn't a one-app folder any more.
  const filling = new Set(moves.map((m) => m.folderId))
  layout.pages.forEach((page, p) => {
    if (page.length === 0) issues.push({ id: `page:${p}`, kind: 'empty-page', page: p })
    for (const item of page) {
      const move = moves.find((m) => m.app === item)
      if (move) issues.push(move)
      const apps = item.kind === 'folder' ? item.pages.flat() : []
      if (item.kind === 'folder' && apps.length === 1 && !filling.has(item.id)) {
        issues.push({
          id: `folder:${item.id}`,
          kind: 'one-app-folder',
          page: p,
          folderId: item.id,
          name: item.name,
          app: apps[0]!
        })
      }
    }
  })
  return issues
}

// Fixes the chosen issues: an empty page goes, a one-app folder gives its slot to the app inside it, and a new
// app moves into its folder. A page that the moves leave empty goes too.
export function applyCleanup(layout: Layout, chosen: readonly CleanupIssue[]): Layout {
  const unwrap = new Set(chosen.flatMap((i) => (i.kind === 'one-app-folder' ? [i.folderId] : [])))
  const drop = new Set(chosen.flatMap((i) => (i.kind === 'empty-page' ? [i.page] : [])))
  const fromList = (items: LayoutItem[]): LayoutItem[] =>
    items.map((item) =>
      item.kind === 'folder' && unwrap.has(item.id) ? item.pages.flat()[0]! : item
    )
  const filed = chosen.reduce(
    (next, i) =>
      i.kind === 'new-app'
        ? (moveItem(next, i.app.id, { zone: 'folder', folderId: i.folderId }) ?? next)
        : next,
    layout
  )
  return {
    ...filed,
    pages: filed.pages
      .map(fromList)
      .filter((page, p) => page.length > 0 || !(drop.has(p) || layout.pages[p]!.length > 0))
  }
}
