# Jiggle: Implementation Plan

## 1. Overview

Jiggle is a macOS desktop app that connects to an iPhone or iPad over a cable (and later over Wi‑Fi), shows a realistic preview of its home screen, and rearranges the apps in one click: alphabetically, by App Store category or by icon color, with optional automatic folders. It is for people with large app collections, from around 80 to 400+ apps, who find dragging icons around on the phone slow, fiddly and error-prone. Since Apple removed home screen management from iTunes, the only official alternative is Apple Configurator, which is built for IT departments. Jiggle makes the job quick and safe: you always see a before/after preview, every change is backed up first, and restoring takes one click.

## 2. Assumptions

- **Device engine:** the working POC uses pymobiledevice3 (Python). The MVP ships it as a bundled, signed **Python sidecar** that the Electron main process controls over JSON‑RPC on stdio. All device access goes through a `DeviceBridge` interface, so the engine can later be replaced by a pure TypeScript implementation without touching the UI.
- **Platform:** macOS only (Apple silicon and Intel). Windows and Linux are out of scope.
- **Distribution:** direct download (notarized DMG). The Mac App Store is not possible: its sandbox blocks the usbmuxd socket, and the app relies on a private device protocol.
- **Supported iOS:** iOS/iPadOS 17 and later, tested on 17, 18 and 26. On older or unrecognized versions the app runs in **read‑only mode**: preview and list work, apply is disabled.
- **One active device at a time.** Several can be connected, and the sidebar device switcher picks the active one.
- **"Type" means App Store category:** the `primaryGenreName` from Apple's public iTunes Lookup API, fetched for the Mac's region. "Developer" is `artistName` from the same API. Apple's own apps (`com.apple.*`) get the category "Apple" without a lookup.
- **Color sort:** each icon's dominant color is converted to HSL. Saturated colors are ordered by hue (red → orange → yellow → green → blue → purple). Near‑neutral icons (saturation < 0.15) go last, light to dark.
- **Folders are sorted as single items** by name. Apps inside folders are not reordered in the MVP.
- **Dock:** never touched in the MVP. In V1 the dock is pinned by default and can be unpinned so it gets sorted too.
- **Widget handling** has two modes. **Keep widget pages** (default) leaves any page with a widget exactly as it is. **Sort around widgets** moves apps and folders off widget pages, leaving only the widgets on them. Widgets themselves are never edited, moved between pages or resized.
- **Sorted pages are packed from the top-left.** iOS 18+ free placement (gaps between icons) is not preserved on pages Jiggle rewrites.
- **Page capacity:** 24 items on iPhone (6×4) and 30 on iPad (6×5 landscape grid), overridable per device in a constant table.
- **Automatic backups** keep the latest 50 per device. Saved layouts (named by the user) are never deleted automatically.
- **"Pin page 1"** keeps every item on page 1 exactly where it is. **"Pin an app"** keeps that app at its current page and slot.
- **"Send to App Library"** means removing the app's icon from the home screen layout. The app stays installed.
- **Auto‑folders** group apps by category into folders named after the category. Apps in a category with fewer than 2 apps stay loose. Existing user folders are left as they are.
- **"Same layout on iPhone and iPad"** means copying the order of one device's layout (live or from a saved snapshot) onto the other. Apps the target doesn't have are skipped, target‑only apps go at the end alphabetically, and pages are reflowed to the target's grid.
- **Wi‑Fi connection** relies on macOS's own Wi‑Fi sync: the user turns on "Show this iPhone when on Wi‑Fi" in Finder once, over the cable.
- **Export:** PNG is one image per page, PDF is all pages in one file, CSV is the app list (name, bundle ID, category, developer, location).
- **Uninstall** is only offered for apps the device reports as removable.
- **Category overrides** are per Mac (global), not per device.

## 3. Scope

### MVP

- Device connection: detection, name/model/iOS version, "Trust this computer" guidance
- Home screen preview: wallpaper, icons, dock, pages, folders, widget placeholders
- App list: searchable table with name, category, developer, location
- Sort presets: A–Z, category, icon color
- Preview before apply: before/after view, one‑click apply
- Automatic backups with history and restore
- Widget handling: keep widget pages / sort around widgets
- Built in from day one: pre‑write validation, automatic backup, one‑click restore, local‑only data, clear errors

### V1

- Drag and drop editing, then push to the phone
- Auto‑folders by category
- Pinning (apps, dock, page 1)
- Send to App Library in bulk
- Saved layouts ("Work", "Weekend") switched in one click
- iPad support
- Export as PNG, PDF, CSV

### Later

- Wi‑Fi connection
- Same layout on iPhone and iPad
- Category overrides
- Cleanup (empty pages, one‑app folders)
- Uninstall apps in bulk

### Out of scope / Future ideas

- Sorting by usage or screen time (iOS doesn't expose this over USB)
- Sorting apps inside folders
- Moving, resizing or adding widgets
- Editing App Library categories
- Managing several devices at once (fleet/MDM features)
- Windows and Linux builds
- Scheduled or rule‑based automatic re‑sorting (automatic backups on connect are M41)
- Sharing layouts between users through an online service (plain layout files are M40)
- Replacing the Python sidecar with a pure TypeScript device engine (see Risks)

## 4. Tech Stack & Architecture

### Stack (fixed)

Electron + React + TypeScript (strict mode).

### Added libraries

| Library                                 | Reason                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| electron-vite                           | Vite builds and HMR for main, preload and renderer in one config.                         |
| React Router (hash router)              | Screen routing that works under `file://` in a packaged app.                              |
| Zustand                                 | Small, boilerplate‑free store for UI state (selection, draft layout, sort options).       |
| TanStack Query                          | Caching, refetching and loading/error states for IPC‑backed async data.                   |
| zod                                     | Validates every IPC payload and every JSON file read from disk.                           |
| TanStack Table + TanStack Virtual       | Sortable, filterable, virtualized app table that stays fast with 400+ rows.               |
| dnd-kit                                 | Accessible drag and drop for the grid editor (keyboard support included).                 |
| Radix UI primitives                     | Accessible, unstyled dialogs, popovers, menus and toggles, styled with our tokens.        |
| CSS Modules + CSS custom properties     | Design tokens map 1:1 to variables, and light/dark comes free via `prefers-color-scheme`. |
| node-vibrant                            | Dominant icon color in pure JS, with no native module to rebuild for Electron.            |
| electron-store                          | Atomic JSON storage for settings, pins and overrides.                                     |
| write-file-atomic                       | Crash‑safe writes for snapshot files.                                                     |
| electron-log                            | Rotating log file for support and debugging.                                              |
| electron-updater                        | Auto‑update from GitHub Releases.                                                         |
| Vitest + React Testing Library          | Fast unit and component tests that share the Vite config.                                 |
| Playwright (`_electron`)                | End‑to‑end tests that drive the real Electron app.                                        |
| pymobiledevice3 + PyInstaller (sidecar) | Proven device protocol from the POC, frozen into a signed binary.                         |
| pytest (sidecar)                        | Tests for the sidecar's RPC handlers.                                                     |

### Process model

- **Main process** (Node): owns the window(s), app menu, storage, network, and all device work. Services:
  - `SidecarBridge`: spawns the sidecar, speaks JSON‑RPC over stdio, restarts it on crash, and turns sidecar events into typed events.
  - `ApplyService`: validate → back up → write → re‑read and verify. It holds a per‑device lock so two writes can never overlap.
  - `SnapshotService`, `CategoryService`, `IconService`, `ExportService`.
- **Preload**: `contextBridge.exposeInMainWorld('jiggle', api)` exposes a typed, minimal API. No Node APIs reach the renderer.
- **Renderer** (React): UI only. It runs with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`, and a strict CSP: `default-src 'self'; img-src 'self' jiggle-icon: data:`.
- **Sidecar** (Python, frozen): stateless commands (`list_devices`, `device_info`, `get_icon_state`, `set_icon_state`, `get_icons`, `get_wallpaper`, `get_icon_metrics`, `list_apps`, `uninstall`) plus a `watch` stream for attach/detach events.

### IPC conventions

- **Requests:** `ipcRenderer.invoke` ↔ `ipcMain.handle`, one channel per action, named `domain:action` (e.g. `layout:get`, `apply:run`).
- **Events:** `webContents.send` for `device:changed`, `apply:progress` and `sidecar:status`.
- **One contract:** channel names, zod schemas and inferred types all live in `src/shared/ipc-contract.ts`, which main, preload and renderer import.

### Platform APIs and permissions

- `protocol.handle('jiggle-icon', …)` serves cached icon PNGs from disk, so the renderer never touches the filesystem.
- `dialog.showSaveDialog` for exports, `webContents.printToPDF` and `capturePage` for PDF and PNG.
- `nativeTheme` for light/dark, `Menu.setApplicationMenu` for the menu bar.
- **Network allowlist:** the only outbound HTTP is `CategoryService` to `itunes.apple.com`. `session.webRequest.onBeforeRequest` cancels any other renderer request.
- **No macOS privacy permissions** are needed. USB access goes through the system `usbmuxd` socket.
- **Hardened runtime entitlements:** the Electron defaults (`allow-jit`, `allow-unsigned-executable-memory`), plus `disable-library-validation` for the PyInstaller sidecar's dylibs.

### Folder structure

```
jiggle/
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ build/entitlements.mac.plist
├─ sidecar/                         # Python device engine
│  ├─ jiggle_engine/
│  │  ├─ __main__.py                # JSON-RPC loop over stdio
│  │  ├─ rpc.py                     # request/response/event framing
│  │  ├─ devices.py                 # list, watch, info, pairing state
│  │  ├─ springboard.py             # icon state, icons, wallpaper, metrics
│  │  └─ apps.py                    # installation proxy: list, uninstall
│  ├─ tests/
│  ├─ pyproject.toml
│  └─ build.sh                      # PyInstaller --onedir, per arch
├─ src/
│  ├─ main/
│  │  ├─ index.ts                   # lifecycle, single instance
│  │  ├─ windows.ts                 # main + settings windows
│  │  ├─ menu.ts
│  │  ├─ network.ts                 # outbound allowlist
│  │  ├─ ipc/                       # one handler file per domain
│  │  │  ├─ device.ts  layout.ts  apps.ts  apply.ts
│  │  │  ├─ snapshots.ts  export.ts  settings.ts
│  │  └─ services/
│  │     ├─ bridge/DeviceBridge.ts  # interface
│  │     ├─ bridge/SidecarBridge.ts
│  │     ├─ bridge/MockBridge.ts    # fixtures, for dev + E2E
│  │     ├─ ApplyService.ts
│  │     ├─ SnapshotService.ts
│  │     ├─ CategoryService.ts
│  │     ├─ IconService.ts
│  │     ├─ ExportService.ts
│  │     └─ storage/paths.ts
│  ├─ preload/index.ts
│  ├─ shared/
│  │  ├─ ipc-contract.ts
│  │  ├─ types.ts
│  │  ├─ errors.ts                  # error codes + user messages
│  │  └─ layout/                    # pure engine: no Node, no DOM
│  │     ├─ normalize.ts  serialize.ts  validate.ts  diff.ts
│  │     ├─ sort.ts  color.ts  pins.ts  folders.ts
│  │     ├─ appLibrary.ts  cleanup.ts  reflow.ts  grid.ts
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx  App.tsx  router.tsx
│        ├─ screens/                # Connect, HomeScreen, Apps, Organize, History, Cleanup
│        ├─ sheets/                 # Apply, Export, CopyLayout, SaveLayout
│        ├─ settings/SettingsWindow.tsx
│        ├─ components/             # ui primitives + PhoneFrame, IconTile, PageGrid, BeforeAfter…
│        ├─ state/store.ts          # Zustand
│        ├─ state/queries.ts        # TanStack Query hooks over window.jiggle
│        └─ styles/tokens.css
└─ tests/
   ├─ fixtures/                     # recorded icon states (iPhone, iPad, widgets, folders)
   └─ e2e/
```

### State management and data layer

- **Source of truth for device data:** the main process. The renderer reads it through TanStack Query hooks (`useDevice`, `useLayout`, `useApps`, `useSnapshots`). Device events invalidate the right queries.
- **UI state:** Zustand. It holds the active screen options, table selection, sort options, the **draft layout** (for preview and drag‑and‑drop) and the undo/redo stack.
- **Layout engine:** pure functions in `src/shared/layout`. The renderer uses them for previews, and main re‑runs `validate` before every write. The renderer is never trusted.
- **Persistence:** everything lives under `app.getPath('userData')`:
  - `settings.json`, `pins.json`, `overrides.json` (electron-store)
  - `category-cache.json`
  - `devices/<udid>/snapshots/<id>.json`
  - `devices/<udid>/icons/<bundleId>.png`

## 5. Data Model

```ts
type Udid = string

interface Device {
  udid: Udid
  name: string // "Sam's iPhone"
  productType: string // "iPhone17,1"
  modelName: string // "iPhone 16 Pro"
  deviceClass: 'iPhone' | 'iPad'
  osVersion: string // "26.1"
  connection: 'usb' | 'wifi'
  state: DeviceState
}
type DeviceState =
  'ready' | 'locked' | 'trust-pending' | 'trust-declined' | 'unsupported-os' | 'error'

interface AppInfo {
  bundleId: string
  name: string
  developer: string | null
  category: string // "Social Networking", "Apple", "Unknown"
  categorySource: 'appstore' | 'apple' | 'override' | 'unknown'
  removable: boolean
  iconColor: { h: number; s: number; l: number } | null
}

type RawItem = Record<string, unknown> // untouched SpringBoard dict

type LayoutItem = AppItem | FolderItem | WidgetItem | OtherItem
interface AppItem {
  kind: 'app'
  id: string
  bundleId: string
  name: string
  raw: RawItem
}
interface FolderItem {
  kind: 'folder'
  id: string
  name: string
  pages: AppItem[][]
  raw: RawItem
}
interface WidgetItem {
  kind: 'widget'
  id: string
  raw: RawItem
}
interface OtherItem {
  kind: 'other'
  id: string
  raw: RawItem
} // web clips, unknown

interface Layout {
  dock: LayoutItem[]
  pages: LayoutItem[][]
  grid: { columns: number; rows: number; dockMax: number }
}

interface Snapshot {
  id: string // ULID
  udid: Udid
  kind: 'auto-backup' | 'saved-layout'
  name: string | null // "Work" for saved layouts
  reason: string | null // "Before A–Z sort" for auto-backups
  createdAt: string // ISO
  osVersion: string
  appCount: number
  pageCount: number
  rawState: unknown[] // exact icon state as read from the device
}

type PinTarget =
  | { type: 'app'; bundleId: string; page: number; slot: number }
  | { type: 'dock' }
  | { type: 'page'; page: 1 }
interface Pin {
  udid: Udid
  target: PinTarget
}

interface SortOptions {
  preset: 'name' | 'category' | 'color'
  widgetMode: 'keep-pages' | 'sort-around'
  autoFolders: boolean
}

interface CategoryOverride {
  bundleId: string
  category: string
}

interface CategoryCacheEntry {
  bundleId: string
  storefront: string
  category: string | null
  developer: string | null
  fetchedAt: string
}

interface Settings {
  theme: 'system' | 'light' | 'dark'
  storefront: string // defaults from system locale, e.g. "nl"
  backupRetention: number // 50
  wifiEnabled: boolean
  categoryLookupEnabled: boolean // off = no network at all
}

interface ApplyPlan {
  udid: Udid
  before: Layout
  after: Layout
  reason: string // "A–Z sort", "Manual edit", "Restore: Work"
  removedFromHomeScreen: string[] // bundleIds sent to App Library
}
```

**Relations**

- A `Device` has one current `Layout`, many `AppInfo` records (from the installed‑apps list), many `Snapshot`s and many `Pin`s, all keyed by `udid`.
- Each `AppItem` in a `Layout` links to an `AppInfo` through `bundleId`. An app can be installed but absent from the layout (it's in the App Library).
- `AppInfo.category` is resolved in this order: `CategoryOverride` → `CategoryCacheEntry` → "Apple" for `com.apple.*` → "Unknown".
- A `Snapshot.rawState` normalizes into a `Layout`. Restoring a snapshot writes its `rawState` back unchanged.
- An `ApplyPlan` is created in the renderer, re‑validated in main, and always produces an auto‑backup `Snapshot` before writing.
- **Round‑trip rule:** `serialize(normalize(raw))` must deep‑equal `raw`. Every item keeps its `raw` dict, so unknown fields survive.

## 6. Screens & Navigation

**Pattern:** a single main window with a macOS sidebar (source list), a unified title bar + toolbar, standard menu bar menus, modal sheets attached to the window, and a separate Settings window (⌘,).

| #   | Screen      | Type                                                            | Reached from                                                                 |
| --- | ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| S1  | Connect     | Main content (shown when no device is ready)                    | App launch, device unplugged, error states                                   |
| S2  | Home Screen | Main content, sidebar item                                      | Sidebar, default once a device is ready                                      |
| S3  | Apps        | Main content, sidebar item                                      | Sidebar                                                                      |
| S4  | Organize    | Main content, sidebar item                                      | Sidebar, toolbar "Organize"                                                  |
| S5  | Apply       | Sheet                                                           | "Apply to iPhone" (S4), "Push to iPhone" (S2), Restore/Switch (S6), Fix (S7) |
| S6  | History     | Main content, sidebar item                                      | Sidebar, Device menu                                                         |
| S7  | Cleanup     | Main content, sidebar item                                      | Sidebar                                                                      |
| S8  | Export      | Sheet                                                           | File > Export… (⌘E), toolbar on S2/S3                                        |
| S9  | Copy Layout | Sheet                                                           | File > Copy Layout to Another Device…                                        |
| S10 | Save Layout | Sheet                                                           | File > Save Layout… (⌘S), S6 "Save Current Layout"                           |
| S11 | Settings    | Separate window, tabs: General, Categories, Connection, Privacy | Jiggle > Settings… (⌘,)                                                      |

**Sidebar:** a device header at the top (with a switcher when several devices are connected), then Home Screen, Apps, Organize, History, Cleanup. Cleanup shows a badge with the number of issues.

**Menu bar**

- **Jiggle:** About, Check for Updates…, Settings… ⌘,, Quit
- **File:** Save Layout… ⌘S, Export… ⌘E, Copy Layout to Another Device…
- **Edit:** Undo ⌘Z, Redo ⇧⌘Z, Select All, Find ⌘F
- **Device:** Refresh ⌘R, Back Up Now, Restore Last Backup…
- **View:** Toggle Sidebar, Zoom In/Out
- **Window**, **Help**

**Routes (hash):** `#/connect`, `#/home`, `#/apps`, `#/organize`, `#/history`, `#/cleanup`. The Settings window loads `#/settings/:tab`.

## 7. Implementation Steps

Each milestone leaves the app runnable with `pnpm dev`. During development, `JIGGLE_MOCK_DEVICE=<fixture>` swaps in `MockBridge`, so UI work doesn't need a phone.

Each milestone ends with **Done when** (the pass/fail bar) and a **Manual check** (numbered steps to try by hand and confirm everything in that milestone really works). Before the first manual check on your real phone, screenshot every home screen page on it, so you can compare after each restore.

### MVP

**M1. Project scaffold and window shell**

- **Goal:** an empty but correctly configured Electron app with the navigation skeleton.
- **Tasks:**
  - Scaffold with electron-vite (React + TS strict); add ESLint and Prettier.
  - Set secure `webPreferences` (contextIsolation, sandbox, no nodeIntegration) and the CSP.
  - Build the sidebar shell with placeholder screens and hash routes.
  - Add the app menu with all menus from section 6 (items not yet working are disabled).
  - Add `tokens.css` with light and dark variables.
  - Write a Playwright smoke test.
- **Files touched:** `electron.vite.config.ts`, `src/main/index.ts`, `src/main/windows.ts`, `src/main/menu.ts`, `src/preload/index.ts`, `src/renderer/src/{main,App,router}.tsx`, `src/renderer/src/styles/tokens.css`, `tests/e2e/smoke.spec.ts`
- **Done when:** `pnpm dev` opens a 1280×800 window (minimum 960×640) with the five sidebar items and a working menu bar, and `pnpm test:e2e` passes the smoke test.
- **Manual check:**
  1. Run `pnpm dev`. The window opens at about 1280×800 with the sidebar items Home Screen, Apps, Organize, History and Cleanup.
  2. Drag the window corner to shrink it. It stops at 960×640.
  3. Click each sidebar item. The item highlights and the toolbar title changes to match.
  4. Open every menu bar menu (Jiggle, File, Edit, Device, View, Window, Help). The items match section 6, and the ones not built yet are greyed out.
  5. Switch macOS to Dark (System Settings > Appearance). The window changes colors right away, without a restart.
  6. Open DevTools (View > Toggle Developer Tools in dev) and type `require` in the console. It's `undefined`, which proves the renderer has no Node access.

**M2. Typed IPC contract and mock device bridge**

- **Goal:** a typed path from the renderer to the main process to a (fake) device.
- **Tasks:**
  - Define `ipc-contract.ts` with zod schemas.
  - Expose `window.jiggle` in preload.
  - Define the `DeviceBridge` interface.
  - Implement `MockBridge`, which loads `tests/fixtures/*.json` (recorded from the POC's `backup.plist` converted to JSON). Start with `iphone-basic`, `iphone-widgets`, `iphone-ios16` (unsupported version) and `iphone-messy` (empty pages and one‑app folders).
  - Add TanStack Query hooks and the `device:changed` event wiring.
- **Files touched:** `src/shared/ipc-contract.ts`, `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc/device.ts`, `src/main/services/bridge/{DeviceBridge,MockBridge}.ts`, `src/renderer/src/state/queries.ts`, `tests/fixtures/`
- **Done when:** with `JIGGLE_MOCK_DEVICE=iphone-basic`, the sidebar header shows "Sam's iPhone · iOS 26.1" from the mock, and a unit test shows main rejecting a malformed IPC payload with a zod error.
- **Manual check:**
  1. Run `JIGGLE_MOCK_DEVICE=iphone-basic pnpm dev`. The sidebar header shows "Sam's iPhone · iOS 26.1".
  2. Run `pnpm dev` without the variable. The header shows "No device".
  3. In the DevTools console, type `window.jiggle`. Only the documented API groups appear (device, layout, apps, …). No `ipcRenderer` or Node objects.
  4. In the console, call a handler with a wrong argument, e.g. `await window.jiggle.layout.get(123)`. The promise rejects with a readable validation error, and the app keeps working.

**M3. Python sidecar and SidecarBridge**

- **Goal:** the main process can talk to a real iPhone through the bundled engine.
- **Tasks:**
  - Build the sidecar JSON‑RPC loop (newline‑delimited JSON on stdio) with `ping`, `list_devices` and a `watch` event stream.
  - Write `build.sh` (PyInstaller `--onedir`).
  - Implement `SidecarBridge`: spawn from `process.resourcesPath` in production or the venv in dev, request timeouts, auto‑restart with backoff, `sidecar:status` event.
  - Add pytest tests for the RPC framing.
- **Files touched:** `sidecar/jiggle_engine/{__main__,rpc,devices}.py`, `sidecar/build.sh`, `sidecar/tests/test_rpc.py`, `src/main/services/bridge/SidecarBridge.ts`, `src/main/index.ts`
- **Done when:** plugging in a real iPhone logs an attach event with its UDID within 2 seconds, unplugging logs a detach, and killing the sidecar process makes it restart automatically with "engine ready" logged.
- **Manual check:**
  1. In `sidecar/`, run `python -m jiggle_engine`, type `{"id":1,"method":"ping"}` and press Enter. It answers with `"id":1` and a version number. Quit with Ctrl+C.
  2. Start the app with the iPhone unplugged, then plug it in. Within about 2 seconds, `~/Library/Logs/Jiggle/main.log` shows an attach line with the phone's UDID.
  3. Unplug the phone. The log shows a detach line.
  4. Run `pkill -f jiggle_engine` while the app is open. The log shows the engine restarting, and plugging the phone in again is still detected.
  5. Run `sidecar/build.sh`, then run the built binary from the output folder directly and repeat the ping test. It answers the same way.

**M4. Device connection and trust guidance**

- **Goal:** the user always knows what state the phone is in and what to do next.
- **Tasks:**
  - Add `device_info` in the sidecar (name, model, iOS version, device class).
  - Map pymobiledevice3 errors to `DeviceState`: `PasswordRequiredError` → locked, `PairingDialogResponsePendingError` → trust‑pending, `UserDeniedPairingError` → trust‑declined; iOS < 17 → unsupported‑os.
  - Build the Connect screen (S1) with a state‑specific illustration, steps and a retry action.
  - Auto‑navigate to Home Screen when the state becomes `ready`.
- **Files touched:** `sidecar/jiggle_engine/devices.py`, `src/shared/errors.ts`, `src/main/ipc/device.ts`, `src/renderer/src/screens/Connect.tsx`
- **Done when:** each of these cases, reproduced by hand on a real phone, shows its matching Connect message:
  - no phone
  - phone locked (only happens for a phone that isn't trusted yet, or was just restarted and not unlocked since; a trusted phone that is locked can still be read, so it shows as ready)
  - trust prompt pending
  - trust declined
  - trusted, which goes to Home Screen with name, model and iOS version shown
- **Manual check:**
  1. Launch with no phone connected. The Connect screen says "Connect your iPhone" with the three steps.
  2. Plug in a trusted phone while it's locked. Jiggle can still read it, so the app goes straight to Home Screen. This is expected.
  3. To test the locked and trust screens: on the phone, go to Settings > General > Transfer or Reset iPhone > Reset > Reset Location & Privacy. This clears trusted computers (and location and privacy permissions, so only do it on purpose). Lock the phone and plug it in. The screen says "Unlock Sam's iPhone to continue". Unlock the phone, and the screen changes to "Tap Trust on your iPhone".
  4. Tap Don't Trust on the phone. The declined message appears with Try Again. Unplug, plug in and tap Try Again, and the trust prompt comes back.
  5. Tap Trust and enter the passcode. The app moves to Home Screen, and the name, model and iOS version match the phone's Settings > General > About.
  6. Unplug the phone while on Home Screen. The app goes back to the Connect screen.

**M5. Read layout, icons and wallpaper**

- **Goal:** the full home screen data is available in main, normalized and cached.
- **Tasks:**
  - Add sidecar `get_icon_state`, `get_icons` (batched), `get_wallpaper` and `get_icon_metrics`.
  - Write `normalize`/`serialize` in the shared layout engine.
  - Build `IconService` (disk cache per device, `jiggle-icon://` protocol).
  - Fall back to a neutral gradient when the wallpaper is unavailable.
  - Add `layout:get` IPC.
- **Files touched:** `sidecar/jiggle_engine/springboard.py`, `src/shared/layout/{normalize,serialize,grid}.ts`, `src/main/services/IconService.ts`, `src/main/ipc/layout.ts`, `tests/fixtures/`
- **Done when:** a unit test proves `serialize(normalize(raw))` deep‑equals `raw` for every fixture, and connecting a real phone writes one PNG per installed app into the device's icon cache folder.
- **Manual check:**
  1. Connect the phone, then open `~/Library/Application Support/Jiggle/devices/<udid>/icons` in Finder (⇧⌘G to paste the path). There is about one PNG per installed app.
  2. Select a few PNGs and press Space (Quick Look). They show the right icons, not blank or broken images.
  3. Quit and relaunch with the phone still connected. The log shows icons loaded from cache, and startup is noticeably faster than the first time.
  4. Check the wallpaper: either your real wallpaper is saved, or the log shows the gradient fallback is used, with no error shown.
  5. Run `pnpm test normalize`. All round‑trip tests pass, including the fixture made from your own phone.

**M6. Home screen preview**

- **Goal:** a realistic, read‑only picture of the phone's home screen.
- **Tasks:**
  - Build the `PhoneFrame`, `PageGrid`, `IconTile`, `FolderTile` (3×3 mini icons), `WidgetTile` (placeholder of the right size), `Dock` and `PageDots` components.
  - Add page navigation (arrows, swipe on the trackpad, ⌘← / ⌘→).
  - Add a zoom control.
- **Files touched:** `src/renderer/src/screens/HomeScreen.tsx`, `src/renderer/src/components/{PhoneFrame,PageGrid,IconTile,FolderTile,WidgetTile,Dock,PageDots}.tsx`
- **Done when:** for a real phone, pages 1–3 match the phone (same icons in the same order, folders and widget spaces in the right slots, same dock), and a component snapshot test of the `iphone-widgets` fixture passes.
- **Manual check:**
  1. Hold the phone next to the Mac and compare pages 1 to 3 one by one: same icons, same order, same labels.
  2. Folders show the right name and their first 9 apps as mini icons. Widgets appear as placeholders in the same place and size as on the phone. The dock has the same apps.
  3. Change pages with the ‹ › arrows, a two‑finger trackpad swipe, and ⌘← / ⌘→. The number of page dots equals the number of pages on the phone.
  4. Move the zoom slider. The frame scales and icons stay sharp.
  5. Find an app with a long name. It's cut off with "…" like on the phone.
  6. Repeat a quick look in Dark mode. Text and frame stay readable.

**M7. App list with categories and developers**

- **Goal:** a searchable table of every installed app.
- **Tasks:**
  - Add sidecar `list_apps` (installation proxy: bundle ID, display name, removable).
  - Build `CategoryService`: iTunes Lookup with the storefront from settings, a disk cache, 1 request at a time with backoff, `com.apple.*` → "Apple", and failures → "Unknown" with retry next launch.
  - Join with the layout to compute each app's location ("Page 2", "Folder 'Travel' · Page 4", "Dock", "App Library").
  - Build S3 with TanStack Table: search, sortable columns.
- **Files touched:** `sidecar/jiggle_engine/apps.py`, `src/main/services/CategoryService.ts`, `src/main/ipc/apps.ts`, `src/renderer/src/screens/Apps.tsx`
- **Done when:**
  - typing "spo" filters the table to Spotify
  - every row shows a category and either a developer or "Unknown"
  - a second launch makes zero lookup requests for apps already cached (checked in the log)
- **Manual check:**
  1. Open Apps. The row count is close to the app count in the phone's Settings > General > iPhone Storage list (a few built‑in apps may differ).
  2. Type "spo" in the search field. Only Spotify is left. Clear the search and all rows come back.
  3. Click the Category and Developer column headers. The table sorts by that column, and clicking again reverses it.
  4. Check the Location of five apps against the phone: one on a page, one inside a folder, one in the dock, and one that's only in the App Library.
  5. Look up three apps in the App Store. Their category and developer match the table.
  6. Turn off the Mac's Wi‑Fi and relaunch. Cached categories still show, uncached ones show "Unknown" with the offline banner, and nothing crashes.
  7. Turn Wi‑Fi back on and relaunch. The log shows no lookup requests for apps already cached.

**M8. Layout engine: A–Z, category, widget modes, validation**

- **Goal:** the POC's sorting logic as tested, pure TypeScript.
- **Tasks:**
  - Write `sort.ts` (name, category) and widget modes `keep-pages` / `sort-around`.
  - Write `validate.ts`, which checks:
    - each app appears exactly once, except apps deliberately removed
    - no empty folders
    - no page over capacity
    - dock within its maximum
    - widget raw dicts unchanged
  - Write `diff.ts`, which counts moved items.
  - Add a dev script, `pnpm engine:preview <file.plist> [--by name|category] [--widgets keep-pages|sort-around]`, that prints the sorted layout page by page, the same way as the POC.
- **Files touched:** `src/shared/layout/{sort,validate,diff}.ts`, `src/shared/layout/__tests__/`, `scripts/engine-preview.ts`, `package.json`
- **Done when:** unit tests pass for:
  - case‑insensitive A–Z
  - folders sorted as items
  - category grouping, then name
  - dock unchanged
  - both widget modes
  - `validate` rejecting a missing app, a duplicate app and an over‑full page
- **Manual check:**
  1. Run `pnpm test layout`. All tests pass.
  2. Copy your POC `backup.plist` to `tests/fixtures/mine.plist`. Run `pnpm engine:preview tests/fixtures/mine.plist --by name`, then `python3 homesort.py sort` from the POC folder. Both list the same order page by page.
  3. Run `pnpm engine:preview tests/fixtures/mine.plist --by category`. Apps are grouped by category, alphabetical within each group, and folders come first.
  4. Run both previews again with `--widgets sort-around`. Pages with widgets now show only `<widget/other>`, and the dock line is identical to the original in every run.

**M9. Organize screen with before/after preview**

- **Goal:** the user picks a preset and sees exactly what will change, without writing anything.
- **Tasks:**
  - Build S4: preset cards (A–Z, Category; Color added in M12) and a widget mode control.
  - Add the `BeforeAfter` split view with synced page navigation.
  - Add a change summary ("142 of 187 apps will move") and an "Apply to iPhone" button (opens a stub sheet).
- **Files touched:** `src/renderer/src/screens/Organize.tsx`, `src/renderer/src/components/BeforeAfter.tsx`, `src/renderer/src/state/store.ts`
- **Done when:** choosing A–Z on a real phone shows Before and After side by side with a correct moved‑apps count, and re‑reading the icon state afterwards shows the phone is unchanged.
- **Manual check:**
  1. Open Organize and pick A–Z. The After frame is alphabetical. Flip pages and check the Before and After page dots move together.
  2. Pick Category. The After frame regroups and the "… apps will move" number changes.
  3. Switch the widget mode. With "Keep widget pages" the widget pages look identical in Before and After. With "Sort around widgets" they keep only their widgets.
  4. Count the coral dots on one After page. They match the icons that actually changed position on that page.
  5. Click "Apply to iPhone". The placeholder sheet opens. Cancel it.
  6. Look at the phone. Nothing has changed compared with your screenshots.

**M10. Snapshots and the History screen**

- **Goal:** layouts can be saved to disk and listed.
- **Tasks:**
  - Build `SnapshotService`: atomic writes, zod‑validated reads, retention of 50 auto‑backups per device.
  - Add Device > Back Up Now.
  - Build S6: a list grouped by Today / Earlier with date, reason, app count and page count, and a thumbnail of page 1.
- **Files touched:** `src/main/services/SnapshotService.ts`, `src/main/services/storage/paths.ts`, `src/main/ipc/snapshots.ts`, `src/renderer/src/screens/History.tsx`
- **Done when:** "Back Up Now" adds an entry that is still listed after quitting and relaunching, and a unit test confirms the 51st auto‑backup deletes the oldest one.
- **Manual check:**
  1. Open History with no backups yet. The empty state says "No backups yet" with a Back Up Now button.
  2. Choose Device > Back Up Now. A toast appears, and a new row shows the time, app count and page count, matching the Home Screen info strip.
  3. Quit with ⌘Q and relaunch. The backup is still listed.
  4. Open `~/Library/Application Support/Jiggle/devices/<udid>/snapshots/` in Finder. The backup's JSON file is there, and opens as readable JSON.
  5. Unplug the phone. The History entries for that device are still there to look at.

**M11. Apply and restore**

- **Goal:** one‑click apply that is always backed up and verified, plus one‑click restore.
- **Tasks:**
  - Build `ApplyService`, which runs these steps in order, emitting `apply:progress` events:
    1. take the per‑device lock
    2. re‑read the device's current state
    3. check it still matches `plan.before` (otherwise abort with "Layout changed on iPhone")
    4. validate `plan.after`
    5. write an auto‑backup
    6. `set_icon_state`
    7. re‑read and compare
  - Build the Apply sheet (S5): confirm → progress → result.
  - Add Restore in History and Device > Restore Last Backup….
- **Files touched:** `sidecar/jiggle_engine/springboard.py`, `src/main/services/ApplyService.ts`, `src/main/ipc/apply.ts`, `src/renderer/src/sheets/Apply.tsx`, `src/renderer/src/screens/History.tsx`
- **Done when:** applying A–Z rearranges the real phone, History shows an auto‑backup named "Before A–Z sort" created seconds earlier, and restoring it makes a re‑read layout equal to that snapshot.
- **Manual check:**
  1. Organize > A–Z > Apply to iPhone > Apply. The sheet shows the four steps (Checking layout, Backing up, Writing to iPhone, Verifying), then the success message.
  2. On the phone, the home screen is now alphabetical and matches the After preview page by page.
  3. History shows "Before A–Z sort" with the current time.
  4. Click Restore on that backup and confirm. The phone goes back to the original layout. Compare with your screenshots.
  5. Open the A–Z preview, then move one icon by hand on the phone, then click Apply in the app. It stops with "Your iPhone's layout changed since the preview", and nothing is written.
  6. Double‑click Apply quickly. Only one apply runs, and only one backup is created.
  7. Lock the phone and apply again. Reading a locked phone works, but writing is untested: either it applies, or it stops with a clear "Unlock your iPhone" message and nothing is half-written. If it needs an unlock, make the Apply sheet say so.

**M12. Color sort**

- **Goal:** the rainbow preset.
- **Tasks:**
  - Have `IconService` compute each icon's dominant color with node-vibrant once, caching it in `AppInfo.iconColor`.
  - Write `color.ts` to order by hue band, then lightness, with neutrals last.
  - Add a Color preset card to S4.
- **Files touched:** `src/main/services/IconService.ts`, `src/shared/layout/color.ts`, `src/shared/layout/__tests__/color.test.ts`, `src/renderer/src/screens/Organize.tsx`
- **Done when:** a unit test with fixed colors orders red, orange, yellow, green, blue, purple, then white, grey, black, and the Color preset preview on a real phone visibly flows through the rainbow.
- **Manual check:**
  1. Organize > Color. The After frame flows red → orange → yellow → green → blue → purple, with white, grey and black icons at the end.
  2. Find three mostly white icons (e.g. Notion, Google Maps, Uber). They're with the neutrals at the end, not mixed into the colors.
  3. Apply it to the phone and check it looks like a rainbow there too. Then restore from History.
  4. Quit and relaunch. Choosing Color is instant, because the colors are cached.

**M13. Errors and safety hardening**

- **Goal:** every failure is explained, and nothing can leave the phone in a broken state without a backup.
- **Tasks:**
  - Build the error catalog in `errors.ts` (code → title, message, action).
  - Add inline banners and alerts.
  - Handle a phone unplugged mid‑apply (show an "Apply interrupted" banner offering Restore).
  - Add read‑only mode for unsupported iOS.
  - Add a sidecar‑crash banner.
  - Enforce the network allowlist.
  - Add the Settings window (⌘,) with General (appearance, App Store region, backups to keep) and Privacy (category lookup on/off, clear cache) tabs.
  - Add electron-log.
- **Files touched:** `src/shared/errors.ts`, `src/main/network.ts`, `src/main/services/ApplyService.ts`, `src/main/ipc/settings.ts`, `src/renderer/src/settings/SettingsWindow.tsx`, `src/renderer/src/components/Banner.tsx`, all screens' error states
- **Done when:**
  - each of these cases, triggered by hand, shows its catalogued message: locked, trust declined, unsupported iOS, unplugged mid‑apply, sidecar crash, lookup offline
  - unplugging during apply leaves a restorable backup
  - an E2E test confirms a renderer request to any host other than `itunes.apple.com` is blocked
  - with "Look up categories online" off, the log shows no outbound requests at all
- **Manual check:**
  1. Run `JIGGLE_MOCK_DEVICE=iphone-locked pnpm dev`. The "Unlock Sam's iPhone to continue" message appears, with the same catalogued wording as the real case in M4. (A trusted phone that is merely locked still reads fine, so this can't be triggered by locking the real phone.)
  2. Repeat the trust‑declined test from M4. The catalogued message appears.
  3. Run `JIGGLE_MOCK_DEVICE=iphone-ios16 pnpm dev`. The read‑only banner shows, and every Apply/Push button is disabled.
  4. Start an A–Z apply and pull the cable during "Writing to iPhone". The "Apply interrupted" message offers Restore. Reconnect, click Restore, and the phone matches your screenshots.
  5. Run `pkill -f jiggle_engine` while on Home Screen. The engine banner appears, the app recovers by itself, and the preview reloads.
  6. Turn off Wi‑Fi and open Apps. The offline category banner shows, and the table still works.
  7. Press ⌘,. Settings opens. Set Appearance to Dark and the app turns dark. Change the backups to keep to 10 and relaunch: it's still 10.
  8. In Settings > Privacy, turn off "Look up categories online" and relaunch. Watch `nettop -p Jiggle` in Terminal: the app makes no outbound connections, and categories show "Unknown".
  9. Open `~/Library/Logs/Jiggle/main.log`. The errors you just triggered are logged with their error codes.

**M14. MVP packaging, signing, notarization and auto‑update**

- **Goal:** an installable, trusted release.
- **Tasks:**
  - Configure electron-builder: dmg + zip, separate arm64 and x64 builds, the sidecar in `extraResources`, hardened runtime and entitlements, notarization via notarytool API key.
  - Make sure every Mach‑O file inside the sidecar is signed.
  - Configure electron-updater with GitHub Releases.
  - Set up GitHub Actions on macOS runners.
- **Files touched:** `electron-builder.yml`, `build/entitlements.mac.plist`, `sidecar/build.sh`, `.github/workflows/release.yml`, `src/main/index.ts`
- **Done when:** the DMG from CI opens on a clean Mac without a Gatekeeper warning, connects to a phone and applies a sort, and publishing v0.1.1 makes the installed v0.1.0 offer and install the update.
- **Manual check:**
  1. Download the DMG from the GitHub release on another Mac, or in a fresh macOS user account. Drag Jiggle to Applications and open it. No "unidentified developer" or "damaged" warning appears.
  2. In Terminal, run `spctl -a -vv /Applications/Jiggle.app`. It says "accepted" and "Notarized Developer ID".
  3. Run `codesign --verify --deep --strict --verbose=2 /Applications/Jiggle.app`. It reports valid with no errors.
  4. Connect the phone to the installed app, apply A–Z, then restore. Everything works, which proves the bundled engine is found and allowed to run.
  5. Check that the release has both an Apple silicon and an Intel DMG. If you have an Intel Mac, repeat steps 1 and 4 there.
  6. Publish v0.1.1 and open the installed v0.1.0. It offers the update, restarts after installing, and Jiggle > About shows 0.1.1.

### V1

**M15. Drag and drop editing**

- **Goal:** manual rearranging in the Mac preview, then pushing to the phone.
- **Tasks:**
  - Put S2 in Edit mode (icons jiggle) with dnd-kit: move within a page, across pages (hover a page edge to flip), and into or out of folders.
  - Keep a draft layout in Zustand with undo/redo (⌘Z / ⇧⌘Z).
  - Add "Push to iPhone", which opens the Apply sheet with reason "Manual edit".
- **Files touched:** `src/renderer/src/screens/HomeScreen.tsx`, `src/renderer/src/components/{PageGrid,IconTile}.tsx`, `src/renderer/src/state/store.ts`
- **Done when:** dragging Spotify from page 3 to page 1 slot 1 and pushing puts it there on the real phone, and ⌘Z before pushing returns the draft to the original order.
- **Manual check:**
  1. On Home Screen, click Edit. Icons start jiggling and the toolbar shows "Editing · 0 changes".
  2. Drag Spotify from page 3 to the left edge, wait for the page to flip, and drop it on page 1 slot 1. The counter shows 1 change.
  3. Drag an app into an existing folder, and another app out of a folder. Both moves show in the preview.
  4. Press ⌘Z three times, then ⇧⌘Z once. The draft steps back and forward exactly.
  5. Try the keyboard: Tab to an icon, press Space to pick it up, the arrow keys to move it, and Space to drop it.
  6. Click Push to iPhone and apply. The phone matches the draft, and History shows "Before manual edit".
  7. Restore that backup to undo.

**M16. Pinning**

- **Goal:** favourite apps, the dock and page 1 never move during a sort.
- **Tasks:**
  - Write `pins.ts`: pinned slots are reserved first, then the rest are filled in sort order.
  - Add pin toggles: app context menu in S2/S3, a "Pin dock" and "Pin page 1" switch in S4.
  - Show a pin badge on pinned tiles.
  - Store pins in `pins.json` per device.
- **Files touched:** `src/shared/layout/pins.ts`, `src/main/ipc/settings.ts`, `src/renderer/src/screens/{HomeScreen,Apps,Organize}.tsx`, `src/renderer/src/components/IconTile.tsx`
- **Done when:** with WhatsApp pinned at page 1 slot 2 and "Pin page 1" on, an A–Z apply leaves page 1 identical on the real phone, and unit tests cover app pins, dock pin and page pin.
- **Manual check:**
  1. Right‑click WhatsApp > Pin. A coral pin badge appears on its tile in Home Screen and a pin icon in Apps.
  2. In Organize, turn on Pin page 1 and Pin dock, and pick A–Z. In the preview, page 1 and the dock are identical in Before and After.
  3. Pin an app on page 4, slot 6. After the A–Z preview, it's still on page 4, slot 6.
  4. Apply to the phone. Page 1, the dock and the pinned app are untouched, and everything else is sorted. Then restore.
  5. Quit and relaunch. All pins are still there. Unpin them and they're gone after another relaunch.

**M17. Auto‑folders**

- **Goal:** one option groups apps into category folders.
- **Tasks:**
  - Spike: create one folder via `set_icon_state` on a test phone and record the exact raw folder format per iOS version into fixtures.
  - Write `folders.ts` to build folders per category (2+ apps), named after the category.
  - Add an "Create folders by category" toggle in S4.
- **Files touched:** `src/shared/layout/folders.ts`, `tests/fixtures/folder-*.json`, `src/renderer/src/screens/Organize.tsx`
- **Done when:** with the toggle on, the preview shows folders such as "Social Networking" and "Productivity", applying creates them on the real phone with the right apps inside, and restoring the auto‑backup removes them.
- **Manual check:**
  1. Organize > Category, then turn on "Create folders by category". The After frame shows folders named after categories.
  2. Click a folder in the After frame. Its popover lists only apps from that category.
  3. Check that an app which is alone in its category stays loose, and that your own existing folders are unchanged.
  4. Apply. On the phone, open three folders: the names and apps match the preview.
  5. Restore from History. The new folders disappear, and your original folders are back as they were.

**M18. Send to App Library**

- **Goal:** remove many apps from the home screen at once without deleting them.
- **Tasks:**
  - Add multi‑select in S3 and S2 with a "Send to App Library" action.
  - Write `appLibrary.ts` to remove items and record them in `ApplyPlan.removedFromHomeScreen`.
  - Make `validate` accept those removals.
  - Show "App Library" as the location afterwards.
- **Files touched:** `src/shared/layout/{appLibrary,validate}.ts`, `src/renderer/src/screens/{Apps,HomeScreen}.tsx`, `src/renderer/src/sheets/Apply.tsx`
- **Done when:** sending 3 selected apps to the App Library removes them from the real phone's home screen while they remain installed and searchable in the phone's App Library.
- **Manual check:**
  1. In Apps, ⌘‑click three apps and choose Send to App Library. The Apply sheet lists those three apps by name.
  2. Apply. On the phone, their icons are gone from the home screen.
  3. Swipe to the App Library on the phone and search for each one. All three are there and open normally.
  4. In Apps, their Location now says "App Library".
  5. Restore from History. The three icons come back to their old places.

**M19. Saved layouts**

- **Goal:** named layouts that can be switched in one click.
- **Tasks:**
  - Build the Save Layout sheet (S10) with name validation and unique names per device.
  - Add saved layouts as a separate section in S6 with Switch, Rename and Delete.
  - Make Switch go through the Apply sheet (auto‑backup first). Apps installed after the layout was saved are appended alphabetically.
- **Files touched:** `src/renderer/src/sheets/SaveLayout.tsx`, `src/renderer/src/screens/History.tsx`, `src/main/services/SnapshotService.ts`, `src/shared/layout/reflow.ts`
- **Done when:** after saving "Work", applying a different sort, then switching to "Work", a re‑read layout of the real phone equals "Work" and an auto‑backup "Before switching to Work" exists.
- **Manual check:**
  1. Choose File > Save Layout…, type "Work" and save. A toast confirms, and "Work" appears under Saved layouts with a thumbnail.
  2. Try saving another layout called "Work". The inline error appears and Save stays disabled.
  3. Apply the Color sort to the phone.
  4. In History, click Switch on "Work" and apply. The phone is back to the Work layout, and an auto‑backup "Before switching to Work" exists.
  5. Install any new app on the phone, then switch to "Work" again. The new app is placed at the end.
  6. Rename "Work" to "Office", then delete it (with confirmation). Relaunch: both changes stuck.

**M20. iPad support**

- **Goal:** the same features on iPad.
- **Tasks:**
  - Add a per‑device‑class grid table (iPad capacity 30, dock max 13 plus the recent‑apps area left untouched).
  - Add an iPad `PhoneFrame` variant (landscape).
  - Update the Connect screen copy to say "iPad".
  - Add iPad fixtures.
- **Files touched:** `src/shared/layout/grid.ts`, `src/renderer/src/components/PhoneFrame.tsx`, `src/renderer/src/screens/Connect.tsx`, `tests/fixtures/ipad-*.json`
- **Done when:** a real iPad connects, the preview shows the iPad grid and dock, and an A–Z apply fills pages with up to 30 items each.
- **Manual check:**
  1. Connect an iPad. The Connect screen and sidebar say "iPad" with the right model and iPadOS version.
  2. Home Screen shows a landscape iPad frame. Compare the first pages and the dock with the iPad itself.
  3. Organize > A–Z > Apply. The pages on the iPad hold up to 30 apps and match the preview. Then restore.
  4. Connect the iPhone and iPad at the same time. The sidebar device switcher lists both, and each one shows its own layout and apps.

**M21. Export**

- **Goal:** take the layout out of the app.
- **Tasks:**
  - Build the Export sheet (S8): format choice, which pages, include wallpaper.
  - PNG: render each page in a hidden window and `capturePage`.
  - PDF: `printToPDF` of a print route.
  - CSV: the app list columns.
  - Save with `dialog.showSaveDialog`.
- **Files touched:** `src/main/services/ExportService.ts`, `src/main/ipc/export.ts`, `src/renderer/src/sheets/Export.tsx`, `src/renderer/src/screens/ExportPrint.tsx`
- **Done when:** exporting each format produces a file that opens in Preview (PNG, PDF with every page) or Numbers (CSV with one row per installed app and the five columns).
- **Manual check:**
  1. Press ⌘E, choose Image (PNG) with All pages, and save. There is one PNG per page, and each matches the preview.
  2. Export as PDF with "Include wallpaper" off. There is one PDF page per home screen page, with a plain background.
  3. Export as CSV with all columns. Open it in Numbers: the row count equals the Apps table count, and the columns are Name, Bundle ID, Category, Developer, Location.
  4. Start an export and cancel the save dialog. Nothing is written and no error appears.
  5. Click "Show in Finder" in the export toast. Finder opens with the file selected.

### Later

**M22. Category overrides**

- **Goal:** the user can correct an app's category.
- **Tasks:**
  - Add a "Change category…" context menu in S3.
  - Add a Settings > Categories tab (list, edit, reset).
  - Make overrides win in `CategoryService` resolution.
  - Mark overridden categories with a small dot in the table.
- **Files touched:** `src/main/services/CategoryService.ts`, `src/renderer/src/screens/Apps.tsx`, `src/renderer/src/settings/SettingsWindow.tsx`
- **Done when:** setting Revolut to "Finance" shows "Finance" in the table after a relaunch, and the Category sort preview groups Revolut with the other Finance apps.
- **Manual check:**
  1. In Apps, right‑click Revolut > Change Category… > Finance. The table shows Finance with a small coral dot.
  2. Press ⌘, and open Categories. "Revolut → Finance" is listed. Click Reset and Revolut goes back to its App Store category.
  3. Set the override again and relaunch. It's still there.
  4. Organize > Category. Revolut is in the Finance group in the After frame.

**M23. Cleanup**

- **Goal:** find and fix layout clutter.
- **Tasks:**
  - Write `cleanup.ts` to detect empty pages and one‑app folders, and fix them (remove pages, unwrap folders into the same slot).
  - Build S7: an issue list with checkboxes, "Fix Selected" → Apply sheet.
  - Add the sidebar badge count.
- **Files touched:** `src/shared/layout/cleanup.ts`, `src/renderer/src/screens/Cleanup.tsx`
- **Done when:** on a fixture with 2 empty pages and 3 one‑app folders, Cleanup lists 5 issues and the preview after "Fix Selected" shows none; on a real phone the fixes apply and can be restored.
- **Manual check:**
  1. On the phone, put two apps in a new folder, then drag one back out. That leaves a one‑app folder.
  2. Open Cleanup. The sidebar badge and the list show that folder as an issue.
  3. Run `JIGGLE_MOCK_DEVICE=iphone-messy pnpm dev`. Cleanup lists 2 empty pages and 3 one‑app folders, 5 issues in total.
  4. Back on the real phone, uncheck nothing and click Fix Selected. The preview shows the app unwrapped in the folder's old spot. Apply, and the phone matches.
  5. Restore from History. The one‑app folder is back.

**M24. Uninstall apps**

- **Goal:** remove many apps from the device at once.
- **Tasks:**
  - Add sidecar `uninstall` (installation proxy).
  - Add an "Uninstall…" action in S3 for removable apps only, with a destructive confirmation alert listing the apps.
  - Uninstall sequentially with progress.
  - Take a layout auto‑backup first. Note that restoring it can't reinstall apps.
- **Files touched:** `sidecar/jiggle_engine/apps.py`, `src/main/ipc/apps.ts`, `src/renderer/src/screens/Apps.tsx`
- **Done when:** uninstalling a test app from the Mac removes it from the real phone, and selecting a non‑removable app shows the action disabled with the tooltip "This app can't be removed".
- **Manual check:**
  1. Install a small free app you don't need on the phone.
  2. In Apps, select it and choose Uninstall…. The alert names the app. Click Cancel and check it's still installed.
  3. Choose Uninstall… again and confirm. Progress shows, then the app disappears from the table and from the phone.
  4. Select a built‑in app that can't be removed. The Uninstall action is greyed out, with the tooltip "This app can't be removed".

**M25. Wi‑Fi connection**

- **Goal:** use Jiggle without a cable.
- **Tasks:**
  - Add a Settings > Connection tab with a Wi‑Fi toggle and setup steps (Finder → "Show this iPhone when on Wi‑Fi").
  - Make sidecar `list_devices` include network devices when enabled.
  - Add a Wi‑Fi badge in the sidebar.
  - Use longer timeouts on Wi‑Fi.
- **Files touched:** `sidecar/jiggle_engine/devices.py`, `src/main/services/bridge/SidecarBridge.ts`, `src/renderer/src/settings/SettingsWindow.tsx`, `src/renderer/src/components/Sidebar.tsx`
- **Done when:** with Wi‑Fi enabled and the cable unplugged, the phone stays listed with a Wi‑Fi badge and an A–Z apply completes.
- **Manual check:**
  1. With the cable connected, open Finder, select the iPhone, and turn on "Show this iPhone when on Wi‑Fi". Click Apply in Finder.
  2. In Jiggle, press ⌘, > Connection and turn on "Connect over Wi‑Fi". The status says "Sam's iPhone is available over Wi‑Fi".
  3. Unplug the cable. The phone stays in the sidebar with a Wi‑Fi badge.
  4. Browse Home Screen and Apps, then apply A–Z and restore, all without the cable.
  5. Turn off the Mac's Wi‑Fi. The app goes back to the Connect screen with a clear message, without hanging.
  6. Turn the Jiggle Wi‑Fi setting off with the cable unplugged. The phone disappears from the sidebar.

**M26. Same layout on iPhone and iPad**

- **Goal:** copy one device's arrangement onto another.
- **Tasks:**
  - Build the Copy Layout sheet (S9): source (connected device or saved layout of another device) → target (active device), with a preview.
  - Write `reflow.ts`: map by bundle ID, skip missing apps, append target‑only apps alphabetically, rebuild folders with available apps only, reflow to the target grid, and leave the target's widgets per widget mode.
- **Files touched:** `src/shared/layout/reflow.ts`, `src/renderer/src/sheets/CopyLayout.tsx`, `src/shared/layout/__tests__/reflow.test.ts`
- **Done when:** unit tests pass for missing, extra and foldered apps, and copying a real iPhone's layout to a real iPad gives shared apps in the iPhone's order with iPad‑only apps at the end.
- **Manual check:**
  1. Connect the iPhone and iPad and make the iPad active. Choose File > Copy Layout to Another Device… and pick the iPhone as the source.
  2. The summary numbers look plausible. In the preview, apps both devices have appear in the iPhone's order, and iPad‑only apps are at the end.
  3. Click Continue and apply. The iPad matches the preview, and its folders contain only apps the iPad has.
  4. Restore the iPad from History.
  5. Unplug the iPhone, open Copy Layout again and pick a saved iPhone layout (e.g. "Work") as the source. The preview still works.

**M27. Sort widget pages too** (built)

- **Goal:** let a sort also fill the free spots on pages that have widgets, with the widgets staying where they are.
- **Tasks:**
  - Add the widget mode `fill`: apps are dealt, sorted, into the free spots of widget pages, and the other pages are packed full around them, so the last pages empty out and go.
  - With pins, every page keeps its size (as in the pinned in‑place sort).
  - Show "Page removed" on the After frame and "N pages removed" in the summary and the Apply sheet.
- **Files touched:** `src/shared/layout/sort.ts`, `src/renderer/src/screens/Organize.tsx`, `src/renderer/src/components/BeforeAfter.tsx`
- **Done when:** unit tests cover fill with and without pins, and the preview shows removed pages.
- **Manual check:**
  1. Choose Sort widget pages too in Organize. Widgets stay on their pages and spots, and apps fill the spaces around them.
  2. No page is left with a few apps while another page has room. Removed pages show "Page removed".

**M28. Color order** (built)

- **Goal:** let the person choose the order of the colors in the Color sort.
- **Tasks:**
  - Group colors into families (red, orange, yellow, green, teal, blue, purple, pink, white, grey, black), with white, grey and black split by lightness.
  - Add a "Color order" row in Organize, with drag and drop (and Alt + ← / → on the keyboard) and a Reset to the default rainbow order. Keep the order across launches.
- **Files touched:** `src/shared/layout/color.ts`, `src/shared/layout/sort.ts`, `src/renderer/src/components/ColorOrder.tsx`, `src/renderer/src/state/store.ts`
- **Done when:** unit tests cover custom and default orders, and the default order sorts exactly as before.
- **Manual check:**
  1. Choose Color, drag blue to the front and black second. The After preview starts with blue apps, then black ones.
  2. Relaunch Jiggle. The order is kept. Reset restores the rainbow.

**M29. Live reorder while dragging** (built)

- **Goal:** drag and drop that feels like the phone: the other icons make room, animated.
- **Tasks:**
  - Keep a preview layout while dragging. After resting on an icon for about 250 ms, or on the end of a page or the dock, the others slide aside, and the dragged icon leaves a gap.
  - Over a folder or a full place nothing moves. Dropping in the gap keeps it, and cancelling puts everything back.
  - Measure the drop spots again after each reflow.
- **Files touched:** `src/renderer/src/components/Editor.tsx`, `src/renderer/src/components/DragCell.tsx`, `src/renderer/src/screens/HomeScreen.tsx`
- **Done when:** the e2e test shows the icons reflowing while an icon is held over another, and the drop keeps the result.
- **Manual check:**
  1. In Edit mode, drag an icon slowly over others. They slide aside after a short rest, and passing quickly moves nothing.
  2. Drop it. Hold it at a page edge to turn the page and drop on the new page. Drop an app onto a folder. It goes into the folder.

### Planned: M33 onwards

M27–M29 above are built (M29 is in PR #7). These are ideas that are not built yet. They are grouped by what they are for, and in the order I would do them. Each has the same shape as the milestones above, in short.

**Quick wins**

**M33. Undo after Apply**

- **Goal:** a one‑click way back right after sorting.
- **Tasks:** after Apply (and a push from Edit mode) show a toast "Sorted. Undo" that restores the backup taken just before, with the same verification as a restore, for as long as the layout is still the one Jiggle wrote.
- **Files touched:** `src/main/services/ApplyService.ts`, `src/renderer/src/sheets/Apply.tsx`, `src/renderer/src/components/Toast.tsx`
- **Done when:** a test applies a sort, undoes it, and gets the original layout back, and the toast disappears when the phone's layout changed.
- **Manual check:** apply A–Z, click Undo in the toast. The phone is as before. Apply again, change something on the phone, and the Undo is gone.

**M34. Search on the Home Screen**

- **Goal:** find an app on the preview.
- **Tasks:** add a search field (⌘F). Typing a name flips to the page that has the app and highlights it. Enter goes to the next match. Look inside folders and open the folder.
- **Files touched:** `src/renderer/src/screens/HomeScreen.tsx`, `src/shared/layout/locations.ts`
- **Done when:** a test finds an app on page 3 and one inside a folder.
- **Manual check:** press ⌘F, type part of a name. The page turns and the icon is highlighted.

**M35. Multi‑select in Edit mode**

- **Goal:** move several icons at once.
- **Tasks:** add ⌘‑click and shift‑click to select icons, with a count badge. Dragging one moves all of them, and a drop on a folder puts them all in. Add the same live room‑making as M29.
- **Files touched:** `src/renderer/src/components/Editor.tsx`, `src/shared/layout/edit.ts`
- **Done when:** unit tests cover moving several items to a page, the dock and a folder, including the full cases.
- **Manual check:** select three icons, drag them to page 2, then into a folder, and undo.

**M36. Folder editing**

- **Goal:** rename folders and reorder the apps inside them.
- **Tasks:** rename from the open folder (double‑click the name), drag apps to reorder inside it, and create a folder by dropping an app on another app. Validate the 9‑per‑page limit.
- **Files touched:** `src/renderer/src/components/Editor.tsx`, `src/shared/layout/edit.ts`
- **Done when:** unit tests cover rename, reorder and creating a folder, and a push to the phone shows the same.
- **Manual check:** rename a folder, reorder two apps in it, drop an app on another to make a folder, then push.

**M37. App size in the Apps table**

- **Goal:** help decide what to uninstall.
- **Tasks:** ask the device for disk usage in `list_apps` (`StaticDiskUsage` and `DynamicDiskUsage`, if it reports them), add a Size column, and sort by it. Last‑used time is not available over USB (see Out of scope).
- **Files touched:** `sidecar/jiggle_engine/apps.py`, `src/renderer/src/screens/Apps.tsx`, `src/shared/types.ts`
- **Done when:** the column shows sizes on a real phone and sorts, and shows a dash when the device gives none.
- **Manual check:** sort by Size. The biggest apps match Settings > General > iPhone Storage.

**Bigger bets**

**M38. Smart folders**

- **Goal:** auto‑folders by more than category.
- **Tasks:** let the folder rule be category (as now), developer, or first letter. Apps in a group of fewer than 2 stay loose. Show the rule in the Organize options.
- **Files touched:** `src/shared/layout/folders.ts`, `src/renderer/src/screens/Organize.tsx`
- **Done when:** unit tests cover each rule, and the preview shows the folders.
- **Manual check:** choose Folders by developer. Apps from the same developer end up in one folder named after it.

**M39. Widget stacks**

- **Goal:** treat widget stacks properly instead of as opaque items.
- **Tasks:** check how stacks appear in the icon state on a real phone, keep them in their spot in every widget mode, and show them in the preview. Moving, resizing and adding widgets stay out of scope.
- **Files touched:** `src/shared/layout/place.ts`, `src/shared/layout/sort.ts`, `tests/fixtures/`
- **Done when:** a fixture with a stack round‑trips and sorts with the stack where it was.
- **Manual check:** sort a phone that has a widget stack in each of the three widget modes. The stack never moves.

**M40. Layout files**

- **Goal:** share a layout as a file, between your own Macs and devices.
- **Tasks:** add Export layout and Import layout (a `.jiggle` JSON file with a schema version, validated with zod). Importing adds it to the saved layouts. This is files only: no accounts and no online service.
- **Files touched:** `src/main/services/SnapshotService.ts`, `src/main/ipc/snapshots.ts`, `src/renderer/src/screens/History.tsx`
- **Done when:** a layout exported on one Mac imports on another, and a broken or newer file is refused with a clear message.
- **Manual check:** export a saved layout, delete it, import the file, and apply it.

**M41. Automatic backups on connect**

- **Goal:** always have a recent backup, without doing anything.
- **Tasks:** add a setting (off by default). When a known phone connects and its layout differs from the newest backup, take one. Keep the latest 50 as now.
- **Files touched:** `src/main/services/SnapshotService.ts`, `src/main/index.ts`, `src/renderer/src/settings/SettingsWindow.tsx`
- **Done when:** a test connects a mock phone with a changed layout and gets a new backup, and none when nothing changed.
- **Manual check:** turn it on, rearrange an icon on the phone, unplug and plug in again. History shows a new automatic backup.

## 8. Testing Strategy

**Unit tests (Vitest)**

- Everything in `src/shared/layout`: normalize/serialize round‑trip on every fixture, sort presets, color ordering, widget modes, validation rules, diff counts, pins, folders, App Library removal, cleanup, reflow.
- `errors.ts` mapping.
- zod schemas, including rejecting bad payloads.
- `CategoryService` resolution order and cache, with fetch mocked.
- `SnapshotService` retention, with a temp directory.

**Component tests (Vitest + React Testing Library)**

- `PageGrid`, `IconTile` states, `BeforeAfter`.
- Apps table search and sort.
- Organize option changes updating the change summary.
- Banner and alert rendering for each error code.

**Sidecar tests (pytest)**

- RPC framing, error mapping, and each command against a faked pymobiledevice3 service.

**Integration tests (Vitest, Node environment)**

- `ApplyService` with `MockBridge`: lock, "Layout changed on iPhone" abort, backup written before write, verification failure path, disconnect mid‑apply.
- IPC handlers with a fake `ipcMain`.

**End‑to‑end tests (Playwright `_electron`, `JIGGLE_MOCK_DEVICE`)**

- Launch with no device → Connect screen.
- Mock device attach → Home Screen preview.
- Apps search.
- Organize A–Z → Apply → History shows the auto‑backup → Restore.
- Error states via mock flags (locked, trust declined, unsupported).
- Network allowlist.
- V1: drag and drop + undo, Save/Switch layout, Export writes files.

**Manual checks on real hardware** (iPhone on iOS 17, 18 and 26; an iPad; a phone with widgets and folders; a phone with 300+ apps):

- Trust flow, from a fresh pairing to declined.
- Preview fidelity against the phone, page by page.
- Apply and restore for each preset.
- Unplug during apply.
- Auto‑folders and App Library behaviour.
- Wi‑Fi.
- Clean‑Mac install of the notarized DMG, and auto‑update.

## 9. Build, Packaging & Distribution

- **Dev:**
  - `pnpm dev` (electron-vite with HMR).
  - The sidecar runs from `sidecar/.venv` in dev.
  - `pnpm dev:mock` sets `JIGGLE_MOCK_DEVICE=iphone-widgets`.
- **Sidecar build:**
  - `sidecar/build.sh` runs PyInstaller `--onedir` for the host architecture.
  - The output goes to `resources/sidecar/<arch>/`.
  - CI builds on an arm64 runner and an x64 runner.
- **App build:**
  - electron-builder targets `dmg` and `zip` (zip is needed for auto‑update), one build per architecture.
  - `extraResources` copies the matching sidecar.
  - `appId: app.jiggle.mac`, product name "Jiggle".
- **Code signing:**
  - Developer ID Application certificate, hardened runtime, `build/entitlements.mac.plist` (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`).
  - electron-builder (osx-sign) signs all nested Mach‑O files, including the sidecar's dylibs.
- **Notarization:** electron-builder `notarize` using a notarytool App Store Connect API key, from CI secrets.
- **Auto‑update:**
  - electron-updater with the GitHub Releases provider.
  - Checks on launch and every 6 hours, downloads in the background, and installs on quit (with a "Restart to update" toolbar item).
  - The release notes come from the GitHub release.
- **Distribution:**
  - Direct download of the notarized DMG from the website and GitHub Releases.
  - Not the Mac App Store (sandbox and private‑protocol constraints).
- **CI (GitHub Actions):**
  - On every PR: lint, typecheck, unit, component, integration, pytest, and E2E with the mock device.
  - On a version tag: build, sign, notarize, and publish the release.

## 10. Risks & Open Questions

**Risks**

- **GPL licensing:** pymobiledevice3 is GPL‑3.0‑or‑later. Shipping it inside Jiggle likely means Jiggle's distribution must comply with the GPL, unless it's replaced. Decide before the first public release. The options:
  - open‑source Jiggle under the GPL
  - get legal advice on whether a separate sidecar process is enough
  - replace the engine with an own TypeScript implementation of usbmux, lockdown and the SpringBoard service behind `DeviceBridge`
- **Private protocol:** Apple can change or restrict SpringBoard services in any iOS update. Mitigations: the read‑only fallback, fixtures per iOS version, and testing on iOS betas each summer.
- **Icon state format changes** (widgets, free placement, new item types). Mitigations: unknown items are kept raw and their pages frozen, and the round‑trip test runs on every fixture.
- **Wallpaper retrieval** may fail or return a placeholder on newer iOS. Mitigation: the gradient fallback.
- **App Library and folder behaviour** (M17, M18) is unverified. Both milestones start with a spike on a test phone.
- **Sidecar packaging:** PyInstaller binaries add about 50–80 MB, and they need every nested binary signed for notarization. Mitigations: `--onedir`, and verify notarization early in M14, not at the end.
- **iTunes Lookup throttling:** strict rate limits may slow the first launch with 300+ apps. Mitigation: a one‑at‑a‑time queue with backoff, a persistent cache, and the table usable while categories fill in.
- **Device left mid‑write:** an interrupted `set_icon_state` could leave a partial layout. Mitigation: a backup always exists first, plus the interrupted‑apply banner with Restore.

**Open questions**

- Which license and business model (free, paid, open source)? This is tied to the GPL risk.
- Does iTunes Lookup accept several bundle IDs in one request? If yes, batch requests in `CategoryService`.
- Should iOS 18+ free placement (gaps) be preserved on rewritten pages in a later version?
- Should auto‑backups also be exportable (e.g. a "Reveal in Finder" for the snapshot file)?
- What exact iPad grid sizes per model and orientation should `grid.ts` use? Confirm against `get_icon_metrics` on real iPads.

## 11. Design (paste into Claude Design)

> **Design brief: Jiggle for macOS**
>
> **App summary and target users**
> Jiggle is a macOS desktop app that connects to an iPhone or iPad, shows a realistic preview of its home screen, and rearranges the apps in one click: alphabetically, by App Store category or by icon color, with optional automatic folders, pinned favourites and full undo through automatic backups. It is for iPhone and iPad owners with large app collections (80 to 400+ apps) who find rearranging icons on the phone slow and fiddly, and who want to see exactly what will change before anything touches their device.
>
> **Platform and frame sizes**
>
> - **Platform:** macOS desktop app.
> - **Main window:** 1280×800, minimum 960×640, with a 220 px sidebar.
> - **Sheets:** attached to the top of the main window, 520 px wide (Apply, Save Layout) or 600 px wide (Export, Copy Layout).
> - **Settings window:** 680×520, not resizable.
> - **Themes:** both light and dark mode are required. Design every screen in both.
>
> **Platform conventions**
> Follow the Apple Human Interface Guidelines for macOS:
>
> - a unified title bar and toolbar with traffic‑light window controls at the top left
> - a translucent sidebar (source list)
> - sheets for modal tasks
> - alerts for destructive confirmations
> - a standard menu bar
> - SF Pro system typography at 13 pt body text
> - native‑feeling controls: push buttons, segmented controls, switches, popup buttons, search fields
> - a visible keyboard focus ring
>
> Content uses system‑like spacing and density, not web‑app spacing. The iPhone/iPad home screen preview should look like the real iOS home screen (rounded‑square app icons, labels under icons, page dots, a frosted dock) inside a simple, generic device frame. Do not reproduce Apple's own device marketing renders or Apple logos.
>
> **Visual direction**
>
> - **Mood:** a calm, precise Mac utility with one playful touch. Icons gently "jiggle" in edit mode, and color accents celebrate a finished sort.
> - **Adjectives:** tidy, trustworthy, playful.
> - **Avoid:** heavy gradients and glassmorphism everywhere, web‑style giant hero headers, dense enterprise tables with gridlines, neon colors, cartoon mascots, and fear‑based warning copy. Safety should feel reassuring, not scary.
>
> **Design tokens**
>
> Colors (light / dark):
>
> | Token           | Light   | Dark    | Use                                                |
> | --------------- | ------- | ------- | -------------------------------------------------- |
> | primary         | #6157F5 | #7C74FF | Main actions, selection, focus ring                |
> | primary-pressed | #4E44E0 | #6A61F0 | Pressed primary                                    |
> | secondary       | #FF7A59 | #FF8F70 | Playful accents, the "jiggle" highlight, pin badge |
> | background      | #F6F6F8 | #161618 | Window content background                          |
> | surface         | #FFFFFF | #1F1F22 | Cards, tables, sheets                              |
> | surface-2       | #EEEEF2 | #2A2A2E | Sidebar tint, hover rows, segmented control track  |
> | border          | #E2E2E7 | #343439 | Hairlines and dividers (1 px)                      |
> | text            | #1C1C1E | #F2F2F5 | Primary text                                       |
> | text-secondary  | #6E6E73 | #A1A1A8 | Labels, metadata                                   |
> | text-tertiary   | #A1A1A6 | #6E6E76 | Placeholders, disabled                             |
> | success         | #2FB463 | #3CCB75 | Applied, backed up, connected                      |
> | warning         | #F5A524 | #F7B544 | Read‑only mode, layout changed                     |
> | error           | #E5484D | #F2555A | Failures, destructive actions                      |
> | info            | #3B82F6 | #5B9BFF | Neutral information banners                        |
>
> Typography: font family SF Pro (system‑ui / -apple-system); monospace SF Mono for bundle IDs.
>
> | Style                   | Size | Weight       | Line height |
> | ----------------------- | ---- | ------------ | ----------- |
> | Large title             | 26   | Bold 700     | 32          |
> | Title                   | 20   | Semibold 600 | 26          |
> | Headline                | 15   | Semibold 600 | 20          |
> | Body                    | 13   | Regular 400  | 18          |
> | Body emphasized         | 13   | Semibold 600 | 18          |
> | Callout                 | 12   | Regular 400  | 16          |
> | Caption                 | 11   | Medium 500   | 14          |
> | Icon label (in preview) | 10   | Medium 500   | 12          |
> | Mono                    | 12   | Regular 400  | 16          |
>
> - **Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 40, 56.
> - **Corner radii:** 4 (badges), 6 (buttons, inputs, popups), 10 (cards, table container, tiles), 14 (sheets, panels), 22.4% of icon size (app icon squircle), 48 (phone frame), 28 (iPad frame), 18 (dock).
> - **Shadows:**
>   - sm `0 1px 2px rgba(0,0,0,0.06)` (cards)
>   - md `0 4px 12px rgba(0,0,0,0.08)` (device frame, popovers)
>   - lg `0 16px 40px rgba(0,0,0,0.18)` (sheets, dragged icon)
>   - In dark mode, keep shadows and add a 1 px border so surfaces separate.
>
> **Core components** (each with default, hover, pressed, focused, disabled; plus the extra states listed)
>
> - **Buttons:**
>   - Primary (filled primary, white text)
>   - Secondary (surface with border)
>   - Plain/borderless (text in primary)
>   - Destructive (filled error)
>   - Toolbar button (icon + optional label)
>   - Sizes: regular 28 px high, large 32 px.
>   - Extra state: loading (spinner replaces label, width kept).
> - **Inputs:**
>   - Search field (magnifier icon, clear button, ⌘F hint)
>   - Text field (with inline error message below)
>   - Popup button (select)
>   - Segmented control (2–4 segments)
>   - Switch
>   - Checkbox
>   - Stepper
> - **Cards:**
>   - Preset card (icon preview strip, title, one‑line description; selected state with primary border and check)
>   - Snapshot card/row (page‑1 thumbnail, title, metadata, actions)
>   - Issue card (Cleanup)
>   - Empty‑state block (illustration, title, body, action)
> - **List items:**
>   - Table row (default, hover, selected, multi‑selected; zebra off; 32 px high)
>   - Sidebar item (icon, label, optional count badge; default, hover, selected with primary tint)
>   - Settings list row
> - **Device preview elements:**
>   - Device frame (iPhone portrait, iPad landscape)
>   - App icon tile (default, hover, selected, pinned with coral pin badge, jiggling in edit mode, dragging with lifted shadow, drop target with primary outline, removed with faded strike for "Send to App Library")
>   - Folder tile (3×3 mini icons, name label; open folder as a popover grid)
>   - Widget placeholder tile (frosted rounded rectangle sized 2×2, 4×2 or 4×4 slots, label "Widget", lock icon)
>   - Dock (frosted bar, up to 4 icons on iPhone)
>   - Page dots (current page highlighted, clickable)
>   - Moved‑item highlight (small secondary dot on tiles that will move)
> - **Navigation elements:**
>   - Title bar with traffic lights and unified toolbar (window title on the left, contextual actions on the right)
>   - Sidebar with device header (device symbol, name, model · iOS version, connection badge USB or Wi‑Fi, a switcher chevron when 2+ devices)
>   - Sheet header and footer (title; Cancel + primary action on the right)
>   - Settings tab bar (icon tabs at the top of the Settings window)
> - **Feedback:**
>   - Inline banner (info, success, warning, error; with an action button and close)
>   - Alert (title, message, buttons; destructive variant)
>   - Progress bar (determinate) and spinner
>   - Toast (bottom center, auto‑dismiss, e.g. "Backed up · 187 apps")
>   - Step list (numbered steps with icons, for setup guidance)
>
> **Screens**
>
> _S1 Connect_
>
> - **Purpose:** get a device connected and trusted, and explain any blocking state.
> - **Layout, top to bottom:**
>   1. title bar with "Jiggle"
>   2. sidebar visible but items disabled; the device header reads "No device"
>   3. centered content: a large outlined iPhone illustration with a cable, a title, a one‑line body, a step list, and a primary button
> - **Components:** empty‑state block, step list, primary and secondary buttons, banner.
> - **Sample content (default):** title "Connect your iPhone"; body "Plug your iPhone or iPad into this Mac with a cable."; steps "1. Connect the cable · 2. Unlock your iPhone · 3. Tap Trust and enter your passcode"; secondary link "Use Wi‑Fi instead…".
> - **Loading:** spinner and "Connecting to Sam's iPhone…".
> - **Other states:**
>   - Locked: "Unlock Sam's iPhone to continue", with a padlock illustration.
>   - Trust pending: "Tap Trust on your iPhone", with an illustration of the iOS trust dialog highlighting the Trust button.
>   - Trust declined (error banner): "Jiggle wasn't trusted. Unplug and reconnect your iPhone, then tap Trust." Button: "Try Again".
>   - Unsupported OS (warning banner): "iOS 16.7 isn't supported for changes. You can preview your layout, but Apply is turned off." Button: "Continue in Read‑Only Mode".
>   - Engine error: "Jiggle couldn't start its device engine." Buttons: "Restart Engine", "Show Log".
>
> _S2 Home Screen_
>
> - **Purpose:** see the current home screen and rearrange it by hand.
> - **Toolbar:** title "Home Screen"; actions Edit (toggle), Undo, Redo, Export, primary "Push to iPhone" (visible only when the draft has changes).
> - **Layout, top to bottom:**
>   1. an info strip: "187 apps · 9 pages · 2 widgets · Last backup today 09:42"
>   2. center: the device frame showing the current page with wallpaper, icons with labels, folders, widget placeholders and the dock
>   3. page dots and ‹ › arrows below the frame
>   4. a zoom slider at the bottom right
>   5. a right‑hand inspector panel (260 px), shown when an icon is selected: icon, name "Spotify", developer "Spotify AB", category "Music", location "Page 3 · Slot 5", buttons "Pin", "Send to App Library"
> - **Edit mode:** icons jiggle, can be dragged within and across pages (hovering a page edge flips the page) and into or out of folders. A coral "Editing · 3 changes" pill appears in the toolbar.
> - **Components:** device frame, app icon tiles, folder tile, widget tile, dock, page dots, inspector panel, toolbar buttons, toast.
> - **Sample icons on page 1:** WhatsApp, Instagram, Spotify, Google Maps, Notion, Slack, Strava, Duolingo, Revolut, Airbnb, NS, Buienradar, plus a medium "Widget" placeholder at the top. Dock: Phone, Safari, Messages, Camera.
> - **Empty:** "This home screen is empty", with a body explaining that apps live in the App Library.
> - **Loading:** a device frame skeleton with shimmering icon squares and "Reading your home screen…".
> - **Error:** banner "Couldn't read the home screen. Make sure your iPhone is unlocked." with "Try Again".
>
> _S3 Apps_
>
> - **Purpose:** find any app and act on many apps at once.
> - **Toolbar:** title "Apps"; search field ("Search 187 apps"); Export.
> - **Layout, top to bottom:**
>   1. a filter row: category popup "All categories", location segmented control "All · Home Screen · Folders · App Library"
>   2. the table, with columns:
>      - Icon + Name
>      - Category (an overridden category shows a small coral dot)
>      - Developer
>      - Location
>      - Bundle ID (mono, secondary color)
>   3. when 1+ rows are selected, a bottom action bar: "3 selected", buttons "Pin", "Send to App Library", "Change Category…", destructive "Uninstall…"
> - **Sample rows:**
>   - Spotify · Music · Spotify AB · Page 3 · com.spotify.client
>   - Revolut · Finance (override) · Revolut Ltd · Folder "Money" · Page 2 · com.revolut.revolut
>   - NS · Travel · Nederlandse Spoorwegen · Page 1
>   - Strava · Health & Fitness · Strava, Inc. · Page 4
>   - Duolingo · Education · Duolingo · App Library
>   - Calculator · Apple · Apple · Folder "Utilities"
> - **Uninstall alert (destructive):** "Uninstall 3 apps from Sam's iPhone?" Body "Strava, Duolingo and Airbnb will be deleted with their data. Your layout is backed up, but restoring it can't reinstall apps." Buttons "Cancel", "Uninstall".
> - **Change category popover:** a category popup plus "Reset to App Store category".
> - **Empty search:** "No apps match 'xyz'" with "Clear Search".
> - **Loading:** skeleton rows; the category column shows "Looking up…" while categories load.
> - **Error:** banner "Categories couldn't be loaded. You're offline — Jiggle will try again later." (the table stays usable, with categories shown as "Unknown").
>
> _S4 Organize_
>
> - **Purpose:** choose how to sort and preview the result before applying.
> - **Toolbar:** title "Organize"; primary "Apply to iPhone".
> - **Layout, top to bottom:**
>   1. a row of three preset cards:
>      - "A–Z": "Alphabetical by name"
>      - "Category": "Grouped by App Store category"
>      - "Color": "A rainbow of icons"
>      - each card shows a strip of 5 sample icons in that order
>   2. an options row:
>      - Widgets segmented control "Keep widget pages · Sort around widgets"
>      - Switch "Create folders by category"
>      - Switch "Pin dock"
>      - Switch "Pin page 1"
>   3. a Before / After split view: two device frames side by side with synced page dots, labels "Before" and "After", and moved tiles marked with a small coral dot
>   4. a summary line under the split view: "142 of 187 apps will move · 6 folders will be created · 2 widget pages kept"
> - **Empty:** "Connect a device to organize its apps."
> - **Loading:** "Building preview…" spinner over the After frame.
> - **Error:** banner "This layout can't be applied: page 4 would have 26 items (max 24)." with "Report Issue".
> - **Read‑only:** Apply disabled; warning banner "Apply is turned off for iOS 16.7."
>
> _S5 Apply (sheet)_
>
> - **Purpose:** confirm, run and report a change to the device. The same sheet is used for sort, manual edits, restore, layout switch and cleanup fixes.
> - **Layout, top to bottom:**
>   1. title "Apply A–Z to Sam's iPhone?"
>   2. a summary list: "142 apps will move", "6 folders will be created", "Dock and page 1 are pinned"
>   3. a reassurance line with a shield icon: "Your current layout will be backed up first. You can restore it anytime from History."
>   4. footer buttons "Cancel" and primary "Apply"
> - **Progress state:** a determinate progress bar with steps "Checking layout · Backing up · Writing to iPhone · Verifying", the current step bold. Cancel is hidden during "Writing to iPhone".
> - **Success state:** a large checkmark, "Done! Sam's iPhone is sorted A–Z." with secondary "Undo (Restore Backup)" and primary "Close"; a brief confetti of tiny colored icon squares.
> - **Error states:**
>   - "Your iPhone's layout changed since the preview. Refresh and try again." Button: "Refresh Preview".
>   - Disconnected mid‑apply: "The iPhone was disconnected while writing. Reconnect it, then restore the backup from 09:42." Buttons: "Restore Backup", "Close".
>
> _S6 History_
>
> - **Purpose:** browse automatic backups and saved layouts, restore or switch.
> - **Toolbar:** title "History"; actions "Back Up Now", "Save Current Layout…".
> - **Layout, top to bottom:**
>   1. section "Saved layouts": cards with a page‑1 thumbnail, name, metadata and Switch / Rename / Delete. Samples:
>      - "Work · 181 apps · saved 12 Nov"
>      - "Weekend · 184 apps · saved 15 Nov"
>   2. section "Automatic backups", grouped "Today" / "Earlier", one row per backup with a Restore button. Samples:
>      - "Before A–Z sort · 09:42 · 187 apps · 9 pages"
>      - "Before manual edit · 08:15 · 187 apps · 9 pages"
>      - "Before switching to Work · Yesterday 18:03"
>   3. a footer note: "Jiggle keeps the last 50 automatic backups for each device."
> - **Empty:** "No backups yet. Jiggle backs up automatically before every change." with "Back Up Now".
> - **Loading:** skeleton cards.
> - **Error:** "This backup file is damaged and can't be restored." (row shows a warning icon, Restore disabled).
>
> _S7 Cleanup_
>
> - **Purpose:** find and fix clutter.
> - **Toolbar:** title "Cleanup"; primary "Fix Selected".
> - **Layout, top to bottom:**
>   1. a summary header: "5 things to tidy up"
>   2. a list of issue cards with checkboxes (all checked by default) and a mini preview of the affected page:
>      - "Page 6 is empty"
>      - "Page 8 is empty"
>      - "Folder 'Games' has only 1 app (Chess)"
>      - "Folder 'Banking' has only 1 app (ING)"
>      - "Folder 'New' has only 1 app (Lightroom)"
>   3. a fix description under each: "Remove page" or "Move the app out and remove the folder"
> - **Empty:** a success illustration and "Your home screen is tidy."
> - **Loading:** "Scanning your layout…".
> - **Error:** banner "Couldn't scan the layout." with "Try Again".
>
> _S8 Export (sheet)_
>
> - **Purpose:** save the layout or app list as a file.
> - **Layout, top to bottom:**
>   1. title "Export"
>   2. format segmented control "Image (PNG) · PDF · App List (CSV)"
>   3. format options:
>      - for PNG/PDF: a pages popup ("All pages", "Current page") and a switch "Include wallpaper"
>      - for CSV: a column checklist (Name, Bundle ID, Category, Developer, Location)
>   4. a small preview thumbnail
>   5. footer "Cancel", primary "Export…" (opens the macOS save dialog)
> - **Loading:** a progress bar "Rendering page 3 of 9…".
> - **Success:** toast "Exported to Sam's iPhone – Home Screen.pdf" with "Show in Finder".
> - **Error:** "Couldn't save the file. Check you have permission to write to this folder."
>
> _S9 Copy Layout (sheet)_
>
> - **Purpose:** use one device's arrangement on another.
> - **Layout, top to bottom:**
>   1. title "Copy Layout to Sam's iPad Air"
>   2. a source popup listing connected devices and saved layouts of other devices ("Sam's iPhone (connected)", "Sam's iPhone · Work")
>   3. a two‑frame preview, iPhone on the left and iPad After on the right
>   4. a summary: "164 shared apps keep the iPhone order · 12 iPad‑only apps added at the end · 23 iPhone‑only apps skipped"
>   5. footer "Cancel", primary "Continue" (opens the Apply sheet)
> - **Empty:** "Connect another device or save a layout on it first."
> - **Loading:** "Matching apps…".
> - **Error:** "These devices share no apps."
>
> _S10 Save Layout (sheet)_
>
> - **Purpose:** name the current layout so it can be switched back to later.
> - **Layout, top to bottom:**
>   1. title "Save Current Layout"
>   2. a page‑1 thumbnail with "Sam's iPhone · 187 apps · 9 pages"
>   3. a name field with placeholder "e.g. Work"
>   4. footer "Cancel", primary "Save" (disabled while the name is empty)
> - **Empty:** the name field is empty and Save is disabled.
> - **Loading:** Save shows a spinner "Saving…".
> - **Error:** inline under the field: "A layout named 'Work' already exists."
> - **Success:** the sheet closes and a toast reads "Saved layout 'Work'".
>
> _S11 Settings (window)_
>
> - **Purpose:** app‑wide preferences.
> - **Layout:** icon tab bar at the top: General, Categories, Connection, Privacy.
> - **General:**
>   - Appearance popup "System / Light / Dark"
>   - App Store region popup "Netherlands"
>   - Automatic backups to keep: stepper "50"
>   - Updates: "Check automatically" switch with "Check Now"
> - **Categories:**
>   - a list of overrides ("Revolut → Finance", "Strava → Health & Fitness"), each with a Reset button
>   - "Add Override…"
>   - empty state "No category overrides. Right‑click an app in Apps to change its category."
> - **Connection:**
>   - switch "Connect over Wi‑Fi"
>   - a step list: "1. Connect with a cable · 2. In Finder, select your iPhone · 3. Turn on 'Show this iPhone when on Wi‑Fi'"
>   - status line "Sam's iPhone is available over Wi‑Fi" (success) or "No Wi‑Fi devices found" (warning)
> - **Privacy:**
>   - a reassurance panel: "Everything stays on this Mac. Jiggle only contacts Apple's App Store to look up app categories."
>   - a switch "Look up categories online" (off means everything shows as "Unknown")
>   - a "Clear Category Cache" button
> - **Loading:** Wi‑Fi status shows a spinner "Looking for devices…".
> - **Error:** "Couldn't save settings." banner.
>
> **Navigation flow**
>
> 1. App launch opens Connect (S1). When a device is ready, it moves to Home Screen (S2).
> 2. The sidebar switches between Home Screen (S2), Apps (S3), Organize (S4), History (S6) and Cleanup (S7). The device header switcher changes the active device.
> 3. These actions open the Apply sheet (S5):
>    - S4 "Apply to iPhone"
>    - S2 "Push to iPhone"
>    - S6 "Restore" / "Switch"
>    - S7 "Fix Selected"
>    - S9 "Continue"
>    When it finishes, it returns to the screen it came from, with a toast.
> 4. File > Export (⌘E) or the Export toolbar button opens Export (S8). File > Copy Layout to Another Device… opens S9. File > Save Layout (⌘S) or S6 "Save Current Layout…" opens Save Layout (S10).
> 5. Jiggle > Settings (⌘,) opens Settings (S11). S3 "Change Category…" and the Connect screen's "Use Wi‑Fi instead…" also open the matching Settings tab.
> 6. Unplugging the device from any screen returns to Connect (S1), unless an Apply is running, in which case the Apply sheet shows its disconnected error state.
>
> **Instruction**
> Produce every screen listed above (S1 Connect, S2 Home Screen including edit mode and the inspector, S3 Apps including the selection bar and uninstall alert, S4 Organize, S5 Apply sheet in confirm, progress, success and error states, S6 History, S7 Cleanup, S8 Export sheet, S9 Copy Layout sheet, S10 Save Layout sheet, S11 Settings with all four tabs) in both light and dark mode, plus their empty, loading and error states. Use the same design tokens and components throughout, at the 1280×800 window size with the sheets and Settings window at the sizes given.
