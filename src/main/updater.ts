import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { Logger } from './services/bridge/SidecarBridge'

// GitHub Releases updates. Always the person's call: nothing downloads or restarts without a click.
// `manual` checks (the menu item) report "up to date" and errors; the launch check stays quiet.
export function createUpdater(log: Logger): { check: (manual: boolean) => Promise<void> } {
  autoUpdater.logger = {
    info: (m) => log.info(m),
    warn: (m) => log.warn(m),
    error: (m) => log.error(m)
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  let busy = false

  async function check(manual: boolean): Promise<void> {
    if (!app.isPackaged || busy) return
    busy = true
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable) {
        if (manual) {
          await dialog.showMessageBox({
            message: `Jiggle ${app.getVersion()} is up to date.`
          })
        }
        return
      }
      const version = result.updateInfo.version
      const download = await dialog.showMessageBox({
        type: 'info',
        message: `Jiggle ${version} is available.`,
        detail: `You have ${app.getVersion()}. Download it now? Jiggle restarts only when you choose.`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      if (download.response !== 0) return
      await autoUpdater.downloadUpdate()
      const restart = await dialog.showMessageBox({
        type: 'info',
        message: `Jiggle ${version} is ready.`,
        detail: 'Restart to finish updating, or it installs the next time you quit.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      if (restart.response === 0) autoUpdater.quitAndInstall()
    } catch (error) {
      log.warn(`update check failed: ${error instanceof Error ? error.message : String(error)}`)
      if (manual) {
        await dialog.showMessageBox({
          type: 'warning',
          message: 'Could not check for updates.',
          detail: 'Check your internet connection and try again.'
        })
      }
    } finally {
      busy = false
    }
  }

  return { check }
}
