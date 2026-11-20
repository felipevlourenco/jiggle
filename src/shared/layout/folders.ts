import type { AppItem, FolderItem, LayoutItem } from '../types'

export const FOLDER_PAGE = 9 // a folder page is 3 × 3

// "Unknown" means the App Store didn't tell us, not a category.
const UNKNOWN = 'Unknown'

export type FolderRule = 'category' | 'developer' | 'letter'

export interface FolderLookup {
  categoryOf?: (bundleId: string) => string
  developerOf?: (bundleId: string) => string | null
}

// The first letter of a name without accents or case; digits and symbols share "#".
export function letterOf(name: string): string {
  const first =
    name
      .replace(/\p{Cf}/gu, '')
      .trim()
      .normalize('NFD')[0] ?? ''
  return /\p{L}/u.test(first) ? first.toUpperCase() : '#'
}

// Gathers loose apps into one folder per group that has at least 2 of them, named after the group:
// their App Store category, their developer, or the first letter of their name. Everything else (folders,
// single apps, apps the App Store didn't tell us about) passes through; the folders come first. Folders
// already on the phone are never merged with, or renamed.
// The raw dict has the three keys the phone itself gives its folders (see the fixtures).
// ponytail: unverified on a real phone until the M17 spike; a group with more than 9 apps gets several folder pages;
// developers are matched by their exact App Store name ("Google LLC" and "Google Inc." stay apart).
export function foldBy<T extends LayoutItem>(
  items: T[],
  rule: FolderRule,
  lookup: FolderLookup
): (T | FolderItem)[] {
  const keyOf = (app: AppItem): string | null =>
    rule === 'letter'
      ? letterOf(app.name)
      : ((rule === 'category' ? lookup.categoryOf : lookup.developerOf)?.(app.bundleId) ?? null)
  const groups = new Map<string, AppItem[]>()
  for (const item of items) {
    if (item.kind !== 'app') continue
    const key = keyOf(item)
    if (key && key !== UNKNOWN) groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const folded = new Set<string>()
  const folders: FolderItem[] = []
  for (const [key, apps] of groups) {
    if (apps.length < 2) continue
    apps.forEach((a) => folded.add(a.id))
    const pages = Array.from({ length: Math.ceil(apps.length / FOLDER_PAGE) }, (_, i) =>
      apps.slice(i * FOLDER_PAGE, (i + 1) * FOLDER_PAGE)
    )
    folders.push({
      kind: 'folder',
      id: `folder:${key}`,
      name: key,
      pages,
      raw: { displayName: key, iconLists: [], listType: 'folder' }
    })
  }
  return [...folders, ...items.filter((i) => !folded.has(i.id))]
}
