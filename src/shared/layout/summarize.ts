import type { Layout, LayoutItem } from '../types'

// Numbers for the Home Screen info strip.
export function summarize(layout: Layout): { apps: number; pages: number; widgets: number } {
  let apps = 0
  let widgets = 0
  const visit = (item: LayoutItem): void => {
    if (item.kind === 'app') apps++
    else if (item.kind === 'widget') widgets++
    else if (item.kind === 'folder') apps += item.pages.flat().length
  }
  ;[...layout.dock, ...layout.pages.flat()].forEach(visit)
  return { apps, pages: layout.pages.length, widgets }
}
