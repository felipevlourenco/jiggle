import type { Layout, LayoutItem } from '../types'

export const APP_LIBRARY = 'App Library'

// Every app the layout places, in display order, with where it sits:
// "Dock", "Page 2" or "Folder 'Travel' · Page 4". Apps missing from the result live in the App Library.
export function appLocations(layout: Layout): Map<string, { name: string; location: string }> {
  const found = new Map<string, { name: string; location: string }>()
  const visit = (item: LayoutItem, where: string): void => {
    if (item.kind === 'app') found.set(item.bundleId, { name: item.name, location: where })
    else if (item.kind === 'folder') {
      item.pages.flat().forEach((app) => visit(app, `Folder '${item.name}' · ${where}`))
    }
  }
  layout.dock.forEach((item) => visit(item, 'Dock'))
  layout.pages.forEach((page, i) => page.forEach((item) => visit(item, `Page ${i + 1}`)))
  return found
}
