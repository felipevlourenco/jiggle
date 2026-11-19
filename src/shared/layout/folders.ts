import type { AppItem, FolderItem, LayoutItem } from '../types'

export const FOLDER_PAGE = 9 // a folder page is 3 × 3

// "Unknown" means the App Store didn't tell us, not a category.
const UNKNOWN = 'Unknown'

// Gathers loose apps by category into one folder per category that has at least 2 of them, named after
// it. Everything else (folders, single apps, apps of Unknown category) passes through; the folders come
// first. Folders already on the phone are never merged with, or renamed.
// The raw dict has the three keys the phone itself gives its folders (see the fixtures).
// ponytail: unverified on a real phone until the M17 spike; a category with more than 9 apps gets several folder pages.
export function foldByCategory<T extends LayoutItem>(
  items: T[],
  categoryOf: (bundleId: string) => string
): (T | FolderItem)[] {
  const groups = new Map<string, AppItem[]>()
  for (const item of items) {
    if (item.kind !== 'app') continue
    const category = categoryOf(item.bundleId)
    if (category !== UNKNOWN) groups.set(category, [...(groups.get(category) ?? []), item])
  }
  const folded = new Set<string>()
  const folders: FolderItem[] = []
  for (const [category, apps] of groups) {
    if (apps.length < 2) continue
    apps.forEach((a) => folded.add(a.id))
    const pages = Array.from({ length: Math.ceil(apps.length / FOLDER_PAGE) }, (_, i) =>
      apps.slice(i * FOLDER_PAGE, (i + 1) * FOLDER_PAGE)
    )
    folders.push({
      kind: 'folder',
      id: `folder:${category}`,
      name: category,
      pages,
      raw: { displayName: category, iconLists: [], listType: 'folder' }
    })
  }
  return [...folders, ...items.filter((i) => !folded.has(i.id))]
}
