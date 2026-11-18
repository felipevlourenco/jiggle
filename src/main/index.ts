import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log/main'
import type { Broadcast } from '@shared/ipc-contract'
import { registerIpc } from './ipc'
import { handleAssetProtocol, registerAssetScheme } from './protocol'
import { IconService } from './services/IconService'
import type { DeviceBridge } from './services/bridge/DeviceBridge'
import { MockBridge, loadFixture } from './services/bridge/MockBridge'
import { SidecarBridge } from './services/bridge/SidecarBridge'
import { createMainWindow } from './windows'
import { buildMenu } from './menu'

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
    registerIpc(ipcMain, bridge, broadcast, new IconService(bridge, userData, log.scope('icons')))
    if (sidecar) {
      sidecar.onStatus((status) => broadcast('sidecar:status', status))
      sidecar.start()
      app.on('before-quit', () => sidecar.stop())
    }
    log.info(`Jiggle ${app.getVersion()} started`)
    buildMenu()
    createMainWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
