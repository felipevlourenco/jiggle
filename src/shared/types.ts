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

// h 0–360, s and l 0–1.
export interface IconColor {
  h: number
  s: number
  l: number
}

export interface AppInfo extends InstalledApp {
  iconColor: IconColor | null // the icon's dominant color; null until the icon is read
  developer: string | null
  category: string // "Social Networking", "Apple", "Unknown"
  categorySource: 'appstore' | 'apple' | 'override' | 'unknown' // 'override': the person changed it
}

// A category the person chose for an app, instead of the App Store's. Global to this Mac, not per device.
export interface CategoryOverride {
  bundleId: string
  name: string // kept so Settings can list it when the app is gone
  category: string
}

// `lookup`: are categories still being fetched, or is the App Store unreachable?
export interface AppsResult {
  apps: AppInfo[]
  lookup: 'idle' | 'running' | 'offline'
}

// A saved copy of a device's icon state. Restoring writes `rawState` back unchanged.
export interface Snapshot {
  id: string // ULID: sorts by time
  udid: Udid
  kind: 'auto-backup' | 'saved-layout'
  name: string | null // "Work" for saved layouts
  reason: string | null // "Before A–Z sort" for auto-backups
  createdAt: string // ISO
  osVersion: string
  deviceClass?: Device['deviceClass'] // missing in files saved before iPad support: an iPhone
  appCount: number
  pageCount: number
  rawState: RawIconState
}

// What History lists: everything but the big `rawState`, plus page 1 for the thumbnail.
export interface SnapshotSummary extends Omit<Snapshot, 'rawState'> {
  page1: RawItem[]
  damaged: false
}
// A file that can't be read back. It is listed so the person knows, but can't be restored.
export interface DamagedSnapshot {
  id: string
  udid: Udid
  createdAt: string // the file's modified time
  damaged: true
}
export type SnapshotEntry = SnapshotSummary | DamagedSnapshot

// Deleting apps from the device. `removed`: how many went before it stopped.
export type UninstallResult =
  { ok: true; removed: number } | { ok: false; message: string; removed: number }

// File > Export…: the home screen as pictures, or the app list as a spreadsheet. `page` is 1-based.
// The window builds the CSV text (it has the app list); main renders the pages and writes the file.
export type ExportRequest =
  | { format: 'png' | 'pdf'; udid: Udid; page: 'all' | number; wallpaper: boolean }
  | { format: 'csv'; udid: Udid; content: string }
// `canceled`: the person closed the save dialog, which is not an error.
export type ExportResult =
  { ok: true; paths: string[] } | { ok: false; canceled: boolean; message: string }

// Saving, renaming or deleting a saved layout: done, or why not (shown under the name field).
export type SavedLayoutResult =
  { ok: true; layout: SnapshotSummary } | { ok: false; message: string }

// A change to write to a device, built in the renderer and re-checked in main.
export interface ApplyPlan {
  udid: Udid
  reason: string // "A–Z sort": the backup is named "Before A–Z sort"
  // What the person saw as "Before". Main refuses to write if the phone no longer looks like that.
  beforeSignature: string
  after: Layout
  removedFromHomeScreen: string[] // bundleIds sent to the App Library
}

export type ApplyStep = 'checking' | 'backing-up' | 'writing' | 'verifying'

export type ApplyErrorCode =
  | 'busy' // another change to this device is running
  | 'no-device'
  | 'read-only' // unsupported iOS
  | 'layout-changed' // the phone changed since the preview
  | 'invalid' // the new layout failed validation
  | 'not-found' // no such backup
  | 'write-failed'
  | 'interrupted' // the phone was unplugged while writing
  | 'verify-failed'

// `backup` is the automatic backup taken first, when there is one: it is how to undo.
export type ApplyResult =
  | { ok: true; backup: SnapshotSummary }
  | { ok: false; code: ApplyErrorCode; message: string; backup?: SnapshotSummary }

// What a sort must leave where it is, per device. Pinned apps keep their page and slot; page1 keeps all
// of page 1. The dock is never moved by a sort, so it needs no pin.
export interface Pins {
  apps: string[] // bundle ids
  page1: boolean
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  storefront: string // two letters: "nl"
  backupRetention: number // automatic backups kept per device
  categoryLookupEnabled: boolean // off (with updateCheckEnabled): the app makes no network requests at all
  updateCheckEnabled: boolean // look for a new Jiggle on GitHub at launch
}
