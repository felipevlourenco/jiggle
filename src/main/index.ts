import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  session,
  shell
} from 'electron'
import log from 'electron-log/main'
import type { Broadcast } from '@shared/ipc-contract'
import { dominantColor } from '@shared/layout/color'
import { registerIpc } from './ipc'
import { restoreLastBackup } from './ipc/apply'
import { backUpActiveDevice, requestSaveLayout, requestSheet } from './ipc/snapshots'
import { enforceNetworkAllowlist } from './network'
import { handleAssetProtocol, registerAssetScheme } from './protocol'
import { ApplyService } from './services/ApplyService'
import { ElectronPageRenderer } from './services/ElectronPageRenderer'
import { ExportService } from './services/ExportService'
import { CategoryService } from './services/CategoryService'
import { IconService } from './services/IconService'
import { PinsService } from './services/PinsService'
import { UninstallService } from './services/UninstallService'
import { SettingsService } from './services/SettingsService'
import { SnapshotService } from './services/SnapshotService'
import type { DeviceBridge } from './services/bridge/DeviceBridge'
import { MockBridge, loadFixture } from './services/bridge/MockBridge'
import { SidecarBridge } from './services/bridge/SidecarBridge'
import { createUpdater } from './updater'
import { createMainWindow, openSettingsWindow } from './windows'
import { buildMenu } from './menu'

// Tests (and a second dev copy) get a folder of their own. Ignored in packaged builds.
const userDataOverride = app.isPackaged ? undefined : process.env['JIGGLE_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)

registerAssetScheme()

// JIGGLE_MOCK_DEVICE=<fixture> serves a recorded device, "none" an empty one. Ignored in packaged builds.
function createMock(): MockBridge | null {
  const name = app.isPackaged ? undefined : process.env['JIGGLE_MOCK_DEVICE']
  if (!name) return null
  if (name === 'none') return new MockBridge()
  // Several at once: JIGGLE_MOCK_DEVICE=iphone-basic,ipad-basic
  const dir = join(app.getAppPath(), 'tests/fixtures')
  return new MockBridge(name.split(',').map((one) => loadFixture(dir, one.trim())))
}

// The macOS save dialog, attached to the window. JIGGLE_EXPORT_DIR=<folder> (tests; ignored in packaged builds)
// saves there without asking, and JIGGLE_EXPORT_DIR=cancel acts like a cancelled dialog.
async function chooseExportFile(defaultName: string, ext: string): Promise<string | undefined> {
  const dir = app.isPackaged ? undefined : process.env['JIGGLE_EXPORT_DIR']
  if (dir) return dir === 'cancel' ? undefined : join(dir, defaultName)
  const options = {
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  }
  const win = BrowserWindow.getFocusedWindow()
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  return canceled ? undefined : filePath
}

// Packaged: the frozen engine in Resources. Dev: the sidecar's own venv.
function createSidecar(): SidecarBridge {
  const sidecarLog = log.scope('sidecar')
  if (app.isPackaged) {
    const command = join(process.resourcesPath, 'sidecar/jiggle_engine/jiggle_engine')
    return new SidecarBridge({ command, log: sidecarLog })
  }
  const dir = join(app.getAppPath(), 'sidecar')
  const command = join(dir, '.venv/bin/python')
  return new SidecarBridge({ command, args: ['-m', 'jiggle_engine'], cwd: dir, log: sidecarLog })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    const broadcast: Broadcast = (event, payload) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(event, payload)
    }
    const mock = createMock()
    const sidecar = mock ? null : createSidecar()
    const bridge = (mock ?? sidecar) as DeviceBridge
    const userData = app.getPath('userData')
    handleAssetProtocol(userData)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    enforceNetworkAllowlist(session.defaultSession, log.scope('network'), devUrl)
    const settings = new SettingsService(
      userData,
      log.scope('settings'),
      (app.getLocaleCountryCode() || 'us').toLowerCase(),
      (s) => {
        nativeTheme.themeSource = s.theme
        sidecar?.setWifi(s.wifiEnabled)
        broadcast('settings:changed', s)
      }
    )
    nativeTheme.themeSource = settings.get().theme
    sidecar?.setWifi(settings.get().wifiEnabled) // before the engine starts: it is told with its first `watch`
    const icons = new IconService(bridge, userData, log.scope('icons'), (png) => {
      const image = nativeImage.createFromBuffer(png)
      const { width, height } = image.getSize()
      return width ? dominantColor({ data: image.toBitmap(), width, height }) : null
    })
    const categories = new CategoryService({
      root: userData,
      storefront: () => settings.get().storefront,
      // Off in Settings > Privacy, or JIGGLE_NO_LOOKUP in tests and offline dev: no requests at all.
      enabled: () =>
        settings.get().categoryLookupEnabled &&
        (app.isPackaged || !process.env['JIGGLE_NO_LOOKUP']),
      log: log.scope('categories'),
      onChange: () => broadcast('apps:changed', undefined)
    })
    const snapshots = new SnapshotService(userData, log.scope('snapshots'), {
      keepAutoBackups: () => settings.get().backupRetention
    })
    const pins = new PinsService(userData, log.scope('pins'))
    const exporter = new ExportService({
      bridge,
      renderer: new ElectronPageRenderer(),
      choose: chooseExportFile,
      reveal: (path) => shell.showItemInFolder(path),
      broadcast,
      log: log.scope('export')
    })
    const apply = new ApplyService({ bridge, snapshots, broadcast, log: log.scope('apply') })
    registerIpc(ipcMain, {
      bridge,
      broadcast,
      icons,
      categories,
      snapshots,
      apply,
      exporter,
      uninstaller: new UninstallService({
        bridge,
        snapshots,
        apply,
        broadcast,
        log: log.scope('uninstall')
      }),
      settings,
      pins,
      sidecarStatus: () => sidecar?.getStatus() ?? 'ready'
    })
    if (sidecar) {
      sidecar.onStatus((status) => broadcast('sidecar:status', status))
      sidecar.start()
      app.on('before-quit', () => sidecar.stop())
    }
    log.info(`Jiggle ${app.getVersion()} started`)
    const updater = createUpdater(log.scope('updater'))
    buildMenu({
      openSettings: openSettingsWindow,
      checkForUpdates: () => void updater.check(true),
      backUpNow: () => void backUpActiveDevice({ bridge, snapshots, broadcast }),
      saveLayout: () => void requestSaveLayout({ bridge, broadcast }),
      copyLayout: () =>
        void requestSheet({ bridge, broadcast }, 'menu:copy-layout', 'copy a layout to it'),
      exportLayout: () => void requestSheet({ bridge, broadcast }, 'menu:export', 'export it'),
      restoreLast: () =>
        void restoreLastBackup({
          bridge,
          snapshots,
          apply,
          broadcast,
          confirm: async (question) =>
            (
              await dialog.showMessageBox({
                type: 'question',
                message: question,
                buttons: ['Restore', 'Cancel'],
                defaultId: 1,
                cancelId: 1
              })
            ).response === 0
        })
    })
    createMainWindow()
    if (settings.get().updateCheckEnabled) void updater.check(false)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
