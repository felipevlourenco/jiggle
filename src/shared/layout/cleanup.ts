import type { AppItem, Layout, LayoutItem } from '../types'

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

// Empty pages, and folders holding a single app. In page order. The dock is left alone.
export function findCleanup(layout: Layout): CleanupIssue[] {
  const issues: CleanupIssue[] = []
  layout.pages.forEach((page, p) => {
    if (page.length === 0) issues.push({ id: `page:${p}`, kind: 'empty-page', page: p })
    for (const item of page) {
      const apps = item.kind === 'folder' ? item.pages.flat() : []
      if (item.kind === 'folder' && apps.length === 1) {
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

// Fixes the chosen issues: an empty page goes, and a one-app folder gives its slot to the app inside it.
export function applyCleanup(layout: Layout, chosen: readonly CleanupIssue[]): Layout {
  const unwrap = new Set(chosen.flatMap((i) => (i.kind === 'one-app-folder' ? [i.folderId] : [])))
  const drop = new Set(chosen.flatMap((i) => (i.kind === 'empty-page' ? [i.page] : [])))
  const fromList = (items: LayoutItem[]): LayoutItem[] =>
    items.map((item) =>
      item.kind === 'folder' && unwrap.has(item.id) ? item.pages.flat()[0]! : item
    )
  return {
    ...layout,
    pages: layout.pages.map(fromList).filter((page, p) => !(drop.has(p) && page.length === 0))
  }
}
