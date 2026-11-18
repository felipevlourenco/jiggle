export type Udid = string

export type DeviceState =
  'ready' | 'locked' | 'trust-pending' | 'trust-declined' | 'unsupported-os' | 'error'

export interface Device {
  udid: Udid
  name: string
  productType: string
  modelName: string
  deviceClass: 'iPhone' | 'iPad'
  osVersion: string
  connection: 'usb' | 'wifi'
  state: DeviceState
}

// The untouched SpringBoard icon state: [dock, page 1, page 2, …].
// It becomes a typed Layout in M5.
export type RawItem = Record<string, unknown>
export type RawIconState = RawItem[][]

export interface Grid {
  columns: number
  rows: number
  dockMax: number
}

// Every item keeps its untouched SpringBoard dict in `raw`, so unknown fields survive a round trip.
export interface AppItem {
  kind: 'app'
  id: string
  bundleId: string
  name: string
  raw: RawItem
}
export interface FolderItem {
  kind: 'folder'
  id: string
  name: string
  pages: AppItem[][]
  raw: RawItem
}
export interface WidgetItem {
  kind: 'widget'
  id: string
  raw: RawItem
}
// Web clips and anything we don't recognise. Left exactly as it is.
export interface OtherItem {
  kind: 'other'
  id: string
  raw: RawItem
}
export type LayoutItem = AppItem | FolderItem | WidgetItem | OtherItem

export interface Layout {
  dock: LayoutItem[]
  pages: LayoutItem[][]
  grid: Grid
}

// What `layout:get` returns: the layout (no wallpaper: the phone only gives a stale image or a screenshot).
export interface LayoutResult {
  layout: Layout
}

// What the phone says about an installed app.
export interface InstalledApp {
  bundleId: string
  name: string
  removable: boolean
}

export interface AppInfo extends InstalledApp {
  developer: string | null
  category: string // "Social Networking", "Apple", "Unknown"
  categorySource: 'appstore' | 'apple' | 'unknown'
}

// `lookup`: are categories still being fetched, or is the App Store unreachable?
export interface AppsResult {
  apps: AppInfo[]
  lookup: 'idle' | 'running' | 'offline'
}
