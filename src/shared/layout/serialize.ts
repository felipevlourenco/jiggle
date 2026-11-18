import type { Layout, LayoutItem, RawIconState, RawItem } from '../types'

function serializeItem(item: LayoutItem): RawItem {
  // A folder's apps may have moved, so rebuild its lists; everything else is its raw dict.
  if (item.kind === 'folder') {
    return { ...item.raw, iconLists: item.pages.map((page) => page.map((app) => app.raw)) }
  }
  return item.raw
}

// Inverse of normalize: serialize(normalize(raw)) deep-equals raw.
export function serialize(layout: Layout): RawIconState {
  return [layout.dock.map(serializeItem), ...layout.pages.map((page) => page.map(serializeItem))]
}
