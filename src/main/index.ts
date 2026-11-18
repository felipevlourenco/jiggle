import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { registerIpc } from './ipc'
import { MockBridge, loadFixture } from './services/bridge/MockBridge'
import { createMainWindow } from './windows'
import { buildMenu } from './menu'

// ponytail: always the mock until SidecarBridge lands in M3. With no JIGGLE_MOCK_DEVICE
// it simply lists no devices. The env var is ignored in packaged builds.
function createBridge(): MockBridge {
  const name = app.isPackaged ? undefined : process.env['JIGGLE_MOCK_DEVICE']
  if (!name) return new MockBridge()
  return new MockBridge(loadFixture(join(app.getAppPath(), 'tests/fixtures'), name))
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
    registerIpc(ipcMain, createBridge(), (event) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(event)
    })
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
