import type { AppItem, FolderItem, Layout } from '../types'
import { moveItem } from './edit'
import { compareNames } from './sort'

// What it takes to file new apps: which ones are new (see SnapshotService.newApps) and what each one is.
export interface NewApps {
  ids: ReadonlySet<string> // bundle ids
  categoryOf: (bundleId: string) => string
  developerOf: (bundleId: string) => string | null
}

export interface NewAppIssue {
  id: string
  kind: 'new-app'
  page: number // 0-based: where the app is now
  app: AppItem
  folderId: string
  folderName: string
}

// New apps lying loose on a page that have a folder waiting: one named after their category, else after their
// developer (case and accents don't matter). The rest stay where iOS put them, and so do the dock and apps
// already in a folder. A folder whose last page is full takes no more, as in Edit mode.
export function findNewApps(layout: Layout, newApps: NewApps): NewAppIssue[] {
  const issues: NewAppIssue[] = []
  let planned = layout // with the moves found so far, so two apps don't count on the same free slot
  layout.pages.forEach((page, p) => {
    for (const app of page) {
      if (app.kind !== 'app' || !newApps.ids.has(app.bundleId)) continue
      const folders = [...planned.dock, ...planned.pages.flat()].filter(
        (item): item is FolderItem => item.kind === 'folder'
      )
      const targets = [newApps.categoryOf(app.bundleId), newApps.developerOf(app.bundleId)].flatMap(
        (name) =>
          name && name !== 'Unknown'
            ? folders.filter((folder) => compareNames(folder, { name }) === 0)
            : []
      )
      for (const folder of targets) {
        const next = moveItem(planned, app.id, { zone: 'folder', folderId: folder.id })
        if (!next) continue // full
        planned = next
        issues.push({
          id: `new:${app.bundleId}`,
          kind: 'new-app',
          page: p,
          app,
          folderId: folder.id,
          folderName: folder.name
        })
        break
      }
    }
  })
  return issues
}
