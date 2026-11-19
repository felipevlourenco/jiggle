import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, session } from 'electron'
import log from 'electron-log/main'
import type { Broadcast } from '@shared/ipc-contract'
import { dominantColor } from '@shared/layout/color'
import { registerIpc } from './ipc'
import { restoreLastBackup } from './ipc/apply'
import { backUpActiveDevice } from './ipc/snapshots'
import { enforceNetworkAllowlist } from './network'
import { handleAssetProtocol, registerAssetScheme } from './protocol'
import { ApplyService } from './services/ApplyService'
import { CategoryService } from './services/CategoryService'
import { IconService } from './services/IconService'
import { PinsService } from './services/PinsService'
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
  return new MockBridge(loadFixture(join(app.getAppPath(), 'tests/fixtures'), name))
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
        broadcast('settings:changed', s)
      }
    )
    nativeTheme.themeSource = settings.get().theme
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
    const apply = new ApplyService({ bridge, snapshots, broadcast, log: log.scope('apply') })
    registerIpc(ipcMain, {
      bridge,
      broadcast,
      icons,
      categories,
      snapshots,
      apply,
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
