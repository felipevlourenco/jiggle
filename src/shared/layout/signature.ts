import type { LayoutItem, RawIconState } from '../types'
import { normalize } from './normalize'

const key = (item: LayoutItem): string => {
  switch (item.kind) {
    case 'app':
      return item.bundleId
    case 'folder':
      return `${item.name}[${item.pages.map((p) => p.map((a) => a.bundleId).join(',')).join('|')}]`
    case 'widget':
      return `widget:${String(item.raw['gridSize'] ?? item.raw['elementType'] ?? '')}`
    case 'other':
      return 'other'
  }
}

// What a layout is, without the fields iOS keeps changing (versions, icon dates): which items sit on
// which page in which order. Two states with the same signature look the same on the phone.
// Empty pages are left out: iOS drops them.
// ponytail: a widget is only its size here; compare its raw dict too if iOS ever rewrites widgets.
export function layoutSignature(raw: RawIconState): string {
  const { dock, pages } = normalize(raw, { columns: 4, rows: 6, dockMax: 4 })
  const names = (items: LayoutItem[]): string[] => items.map(key)
  return JSON.stringify([names(dock), ...pages.filter((p) => p.length > 0).map(names)])
}
