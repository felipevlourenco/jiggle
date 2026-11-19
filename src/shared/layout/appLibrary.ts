import type { Layout, LayoutItem } from '../types'

// Takes these apps off the home screen pages. They stay installed and show up in the phone's App Library.
// The dock is left alone. A folder left with no apps goes with them, and so does a page that ends up empty.
export function sendToAppLibrary(layout: Layout, bundleIds: ReadonlySet<string>): Layout {
  const fromList = (items: LayoutItem[]): LayoutItem[] =>
    items.flatMap<LayoutItem>((item) => {
      if (item.kind === 'app') return bundleIds.has(item.bundleId) ? [] : [item]
      if (item.kind !== 'folder' || !item.pages.flat().some((a) => bundleIds.has(a.bundleId))) {
        return [item]
      }
      const pages = item.pages
        .map((p) => p.filter((app) => !bundleIds.has(app.bundleId)))
        .filter((p) => p.length > 0)
      return pages.length ? [{ ...item, pages }] : []
    })
  return {
    ...layout,
    pages: layout.pages
      .map(fromList)
      .filter((page, i) => page.length > 0 || layout.pages[i]!.length === 0)
  }
}
