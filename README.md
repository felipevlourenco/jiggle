<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
    <img src="docs/logo.svg" alt="Jiggle" height="96">
  </picture>
</p>

<p align="center">Rearrange your iPhone or iPad home screen from your Mac.</p>

<p align="center">
  <a href="https://felipevlourenco.github.io/jiggle/">Website</a> ·
  <a href="https://github.com/felipevlourenco/jiggle/releases/latest">Download</a>
</p>

Jiggle connects to an iPhone or iPad over a cable, shows a realistic preview of its home screen, and rearranges the apps in one click: alphabetically, by App Store category or by icon colour, with optional automatic folders. It is for people with hundreds of apps who find dragging icons around on the phone slow and error-prone. You always see a before/after preview, every change is backed up first, and restoring takes one click.

> **Status: early (v0.1).** Everything is built and passes its tests against mock devices, but much of it has not yet been run against real hardware. See [What is verified](#what-is-verified) before pointing it at a phone you care about. Back the phone up first.

## See it in action

The demos use a mock phone, so the icons are placeholders.

**Preview a sort before it touches the phone.** Switch between A–Z, category and colour, turn on folders, and see the before and after of every page.

![Organize: choosing a sort and folders, with a before and after preview](docs/gifs/organize.gif)

**Edit by hand.** Drag an icon and the others make room as you go, like on the phone. Undo with ⌘Z, then push to the phone when you are happy.

![Edit mode: dragging an icon, the others slide to make room, then undo](docs/gifs/edit.gif)

**Find an app.** Search the Home Screen and Jiggle jumps to the page and highlights the app.

![Search: typing in the Find an app field highlights the matching icon](docs/gifs/search.gif)

## Features

- **Preview** the Home Screen as it is: wallpaper, pages, dock, folders and widget placeholders.
- **Apps table**: searchable and sortable by name, category, developer, location and size. **Largest apps** ranks them by size and totals the ones you tick, ready to send to the App Library or uninstall. Change an app's category (kept per Mac) or remove apps in bulk.
- **Organize**: sort by **A–Z**, **App Store category** or **icon colour**, with a before/after preview. Optional auto-folders (one folder per category, developer or first letter, from 2 apps) and pins. Pages with widgets are kept as they are, cleared of apps (sort around widgets), or sorted too with every widget staying in its spot and the other pages packed full (sort widget pages too).
- **Edit by hand**: drag and drop (or Space and arrow keys), with undo and redo, then push to the phone.
- **Send to App Library**: take apps off the Home Screen in bulk. They stay installed.
- **Saved layouts**: name the current layout ("Work", "Weekend") and switch back to it in one click. Export one as a `.jiggle` file and import it on another Mac or device.
- **Copy a layout between devices**: put the arrangement of an iPhone on an iPad, or the reverse, reflowed to the target's grid.
- **Cleanup**: remove empty pages and one-app folders, and move newly installed apps into the folder named after their category or developer. New apps are found by comparing with an earlier automatic backup.
- **Export**: PNG (one image per page), PDF (all pages) or CSV (name, bundle ID, category, developer, location).
- **History**: automatic backups before every write (the latest 50 per device are kept), one-click restore, and a **Compare** that lists what moved since a backup or saved layout. Optionally a backup is also taken when a device connects, if its layout changed.
- **Wi-Fi** (Mac only): works over Wi-Fi once "Show this iPhone when on Wi-Fi" is on in Finder.
- **Safe by design**: validation before every write, a backup first, a read-back to verify afterwards, and read-only mode on iOS versions it does not recognise.

## Install

Releases are on the [Releases page](https://github.com/felipevlourenco/jiggle/releases). From 0.1.5 on there is a build for Apple silicon (the `arm64` file) and one for Intel (the `x64` file). The Intel build is new and hasn't been tested on Intel hardware with an iPhone yet.

Builds from 0.1.4 on are signed with a Developer ID certificate and notarized by Apple, so they open like any other Mac app. Jiggle checks for updates at launch and installs them itself (you can turn that off in Settings). Versions up to 0.1.3 were not notarized and need System Settings > Privacy & Security > **Open Anyway** on first launch.

### Windows (beta)

The Windows build is the `-setup.exe` file, on releases that have one. It is for 64-bit Intel and AMD PCs. **It has not been tried with a real iPhone yet**, so treat it as experimental and back the phone up first.

1. Install the [Apple Devices](https://support.apple.com/118290) app from the Microsoft Store, or iTunes. Jiggle reaches the phone through Apple's driver, which comes with them.
2. Run the installer. It isn't signed yet, so Windows SmartScreen may warn you: choose **More info**, then **Run anyway**. Only do this for a file downloaded from this repository's Releases page.
3. Connect the iPhone with a cable, unlock it and tap **Trust**.

Wi-Fi isn't offered on Windows. Logs are in `%APPDATA%\Jiggle\logs`.

### Linux (beta)

The Linux build is the `.AppImage` file, on releases that have one. It is for 64-bit Intel and AMD computers, and is built on Ubuntu 24.04, so older distributions may not run it. **It has not been tried with a real iPhone yet**, so treat it as experimental and back the phone up first.

1. Install `usbmuxd`, the service Jiggle reaches the phone through. On Ubuntu and Debian: `sudo apt install usbmuxd`. It normally starts by itself when you plug the phone in.
2. Make the file executable and run it:

   ```bash
   chmod +x Jiggle-*.AppImage
   ./Jiggle-*.AppImage
   ```

3. Connect the iPhone with a cable, unlock it and tap **Trust**.

The file isn't signed, so only run one downloaded from this repository's Releases page. **On Ubuntu 24.04 the AppImage runs with Chromium's sandbox turned off**, which removes one layer of protection. The same happens on any system that doesn't let apps create user namespaces. (We saw this on GitHub's Ubuntu 24.04 build machine, not yet on a desktop.) Wi-Fi isn't offered on Linux. Logs are in `~/.config/Jiggle/logs`.

Requirements: macOS (or Windows or Linux, in beta), and an iPhone or iPad on iOS or iPadOS 17 or later (tested on 17, 18 and 26). The phone must be unlocked and tap **Trust** the first time it is connected.

## Develop

Needs Node 24, [pnpm](https://pnpm.io) and [uv](https://docs.astral.sh/uv/) (for the Python engine).

```bash
pnpm install
cd sidecar && uv sync --python 3.12 --group dev && cd ..
pnpm dev
```

No phone at hand? Run against a mock device. The fixtures are in `tests/fixtures`:

```bash
JIGGLE_MOCK_DEVICE=iphone-widgets pnpm dev
```

| Command                                           | What it does                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`                                  | TypeScript, strict, main and renderer                                  |
| `pnpm lint`                                       | ESLint                                                                 |
| `pnpm test`                                       | Vitest unit and component tests                                        |
| `pnpm test:e2e`                                   | Builds, then Playwright drives the real Electron app against mocks     |
| `cd sidecar && uv run --no-sync python -m pytest` | Tests for the engine's RPC handlers                                    |
| `pnpm dist`                                       | Builds the app. Run `bash sidecar/build.sh` first to freeze the engine |

The end-to-end tests keep the app's windows hidden. To watch them, run `SHOW=1 pnpm test:e2e`.

CI (`.github/workflows/ci.yml`) runs all of these on every pull request. Pushing a `v*` tag that matches `package.json`'s version runs `release.yml`, which builds and signs the Mac apps, builds the unsigned Windows installer and Linux AppImage, and creates a **draft** GitHub release.

## How it works

```
┌─ Renderer (React) ──────────┐   typed IPC    ┌─ Main process (Node) ────────────────┐
│ screens, sheets, drag/drop  │ ◄────────────► │ ApplyService · SnapshotService       │
│ sandboxed, strict CSP       │  (zod-checked) │ CategoryService · IconService        │
└─────────────────────────────┘                │ ExportService · UninstallService     │
                                               └──────────────┬───────────────────────┘
                                                  DeviceBridge│ JSON-RPC over stdio
                                               ┌──────────────▼───────────────────────┐
                                               │ Python sidecar (pymobiledevice3)     │
                                               │ frozen with PyInstaller              │
                                               └──────────────┬───────────────────────┘
                                                              │ usbmuxd
                                                           iPhone / iPad
```

- **Electron + React + TypeScript** (strict). The renderer is sandboxed with `contextIsolation`, and every IPC channel and payload is declared once in `src/shared/ipc-contract.ts` and validated with zod.
- **Device engine** (`sidecar/`): a Python process using [pymobiledevice3](https://github.com/doronz88/pymobiledevice3), controlled over JSON-RPC. Everything goes through a `DeviceBridge` interface, so the engine can be replaced later, and a `MockBridge` serves the fixtures for dev and tests.
- **Pure layout logic** lives in `src/shared/layout`: sorting, reflow, pins, auto-folders, cleanup, diffing and validation. It has no Electron or device code, and is covered by unit tests.
- **Writes** go through `ApplyService`: validate, back up, write, read back and verify, under a per-device lock. Page capacity is checked against the grid the device reports, not a fixed table.
- **Privacy:** everything stays on your Mac. The only network request is the App Store lookup for categories (`itunes.apple.com`, one app at a time, cached on disk). Any other request from the renderer is blocked. Data lives in Electron's user data folder; logs are in `~/Library/Logs/Jiggle/`.

## What is verified

All of it passes typecheck, lint, 284 unit tests, 35 engine tests and 48 end-to-end tests, run against mock devices. Not yet confirmed on real hardware:

- Writing to a phone: drag and drop, pins, auto-folders, Send to App Library, saved layouts, and uninstall.
- Wi-Fi connection.
- **iPad**: no iPad has been available. The grid (6×5), dock size and widget spans come from memory and are checked only against fixtures. Treat iPad support, and copying a layout to or from an iPad, as experimental.

Apple can change the private SpringBoard services in any iOS update. If Jiggle does not recognise the iOS version it opens read-only.

## Licence

Jiggle is free software, released under the [GNU General Public License v3.0 or later](LICENSE). Copyright (C) 2026 Felipe Lourenco.

The device engine bundles [pymobiledevice3](https://github.com/doronz88/pymobiledevice3) and its dependencies, which are GPL-3.0-or-later, so Jiggle as a whole is distributed under the same terms. The source for every release is the tagged commit in this repository.

## Brand

The icon and logo are in `build/` and `docs/`. `build/icon.icns` is generated from `build/icon.svg` (with the simplified `build/icon-small.svg` for the smallest sizes). `build/icon.png` is the Dock icon when running in dev.
