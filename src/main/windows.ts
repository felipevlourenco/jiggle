import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { OS } from '@shared/platform'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    // A Mac draws its traffic lights over the sidebar. Elsewhere the window keeps the system's own frame.
    ...(OS === 'mac' && {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      backgroundColor: '#00000000'
    }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Never open new windows or navigate away; external links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  loadRenderer(win)
  return win
}

// The same page for every window; `route` picks the screen ("/settings").
export function loadRenderer(win: BrowserWindow, route?: string): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return win.loadURL(route ? `${devUrl}#${route}` : devUrl)
  return win.loadFile(
    join(__dirname, '../renderer/index.html'),
    route ? { hash: route } : undefined
  )
}

// An invisible window that draws the export pages (see ExportService). Same preload as every window.
export function createExportWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 1400, // larger than the biggest page, which is captured by its rectangle
    height: 1000,
    enableLargerThanScreen: true, // a small display (a CI runner) must not crop the page
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  win.removeMenu() // Windows and Linux draw a menu bar in every window; no effect on a Mac
  return win
}

let settingsWindow: BrowserWindow | undefined

// One Settings window: ⌘, again just brings it forward.
export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 460,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Settings',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  settingsWindow.removeMenu() // the fixed height leaves no room for a menu bar
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  settingsWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  loadRenderer(settingsWindow, '/settings')
}
