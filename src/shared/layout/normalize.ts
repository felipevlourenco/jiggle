import type { AppItem, Grid, Layout, LayoutItem, RawIconState, RawItem } from '../types'

const isWidget = (raw: RawItem): boolean => 'gridSize' in raw || 'elementType' in raw

// An app icon names its app by `bundleIdentifier`. Some apps that aren't fully installed (offloaded,
// or still downloading) only carry `displayIdentifier`: they are still icons that sort like any app.
const appIdOf = (raw: RawItem): string | undefined => {
  if (isWidget(raw) || 'listType' in raw) return undefined
  const id = raw['bundleIdentifier'] ?? raw['displayIdentifier']
  return typeof id === 'string' ? id : undefined
}
const isApp = (raw: RawItem): boolean => appIdOf(raw) !== undefined

const toApp = (raw: RawItem): AppItem => {
  const bundleId = appIdOf(raw)!
  const name = raw['displayName']
  return {
    kind: 'app',
    id: bundleId,
    bundleId,
    name: typeof name === 'string' ? name : bundleId,
    raw
  }
}

function normalizeItem(raw: RawItem, id: string): LayoutItem {
  if (isApp(raw)) return toApp(raw)
  if (raw['listType'] === 'folder') {
    const lists = raw['iconLists']
    // A folder holding anything but plain apps is left alone, like any unknown item.
    if (Array.isArray(lists) && lists.every((l) => Array.isArray(l) && l.every(isAppRaw))) {
      const name = raw['displayName']
      return {
        kind: 'folder',
        id,
        name: typeof name === 'string' ? name : '',
        pages: (lists as RawItem[][]).map((page) => page.map(toApp)),
        raw
      }
    }
  } else if (isWidget(raw)) {
    return { kind: 'widget', id, raw }
  }
  return { kind: 'other', id, raw }
}

const isAppRaw = (x: unknown): boolean => typeof x === 'object' && x !== null && isApp(x as RawItem)

// state[0] is the dock, state[1:] are the home screen pages.
export function normalize(raw: RawIconState, grid: Grid): Layout {
  const [dock = [], ...pages] = raw
  return {
    dock: dock.map((item, i) => normalizeItem(item, `dock-${i}`)),
    pages: pages.map((page, p) => page.map((item, i) => normalizeItem(item, `p${p + 1}-${i}`))),
    grid
  }
}
