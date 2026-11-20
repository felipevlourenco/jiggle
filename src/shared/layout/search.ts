import type { Layout, LayoutItem } from '../types'

export interface AppMatch {
  id: string
  name: string
  page: number | null // index into layout.pages; null: in the dock
  folderId: string | null // the folder it is in, if any
}

// Case, accents and the invisible direction marks some apps put in their names don't matter.
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toLowerCase()
    .trim()

// Apps whose name contains the text, in the order a person flips through the phone: page by page, then the
// dock. Apps inside folders count, and say which folder to open.
export function findApps(layout: Layout, query: string): AppMatch[] {
  const q = fold(query)
  if (!q) return []
  const found: AppMatch[] = []
  const visit = (item: LayoutItem, page: number | null, folderId: string | null): void => {
    if (item.kind === 'app' && fold(item.name).includes(q)) {
      found.push({ id: item.id, name: item.name, page, folderId })
    } else if (item.kind === 'folder') {
      item.pages.flat().forEach((app) => visit(app, page, item.id))
    }
  }
  layout.pages.forEach((items, i) => items.forEach((item) => visit(item, i, null)))
  layout.dock.forEach((item) => visit(item, null, null))
  return found
}
