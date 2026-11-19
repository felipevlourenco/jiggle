import type { Broadcast } from '@shared/ipc-contract'
import type { UninstallResult } from '@shared/types'
import type { ApplyService } from './ApplyService'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import type { SnapshotService } from './SnapshotService'

interface Deps {
  bridge: DeviceBridge
  snapshots: SnapshotService
  apply: ApplyService // for its one-change-at-a-time lock
  broadcast: Broadcast
  log: Logger
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))
const plural = (n: number): string => `${n} app${n === 1 ? '' : 's'}`

// Deletes apps and their data from a device: the one thing Jiggle does that a backup can't undo.
// Checks everything first (device, removable), backs the layout up, then goes one app at a time.
export class UninstallService {
  constructor(private readonly deps: Deps) {}

  async run(udid: string, bundleIds: string[]): Promise<UninstallResult> {
    const { bridge, snapshots, apply, broadcast, log } = this.deps
    const refuse = (message: string, removed = 0): UninstallResult => {
      log.warn(`uninstall refused: ${message}`)
      return { ok: false, message, removed }
    }
    const release = apply.lock(udid)
    if (!release) return refuse('Another change to this device is already running.')
    try {
      const device = (await bridge.listDevices()).find((d) => d.udid === udid)
      if (!device || device.state !== 'ready')
        return refuse(`Unlock your ${device?.deviceClass ?? 'device'} and try again.`)

      // Everything must be an app the phone says can go, before anything is touched.
      const installed = new Map((await bridge.listApps(udid)).map((a) => [a.bundleId, a]))
      const targets = [...new Set(bundleIds)].map((id) => installed.get(id))
      const stuck = targets.findIndex((a) => !a?.removable)
      if (stuck >= 0) {
        const name = targets[stuck]?.name ?? [...new Set(bundleIds)][stuck]
        return refuse(`${name} can’t be removed.`)
      }
      const apps = targets.map((a) => a!)

      try {
        await snapshots.create({
          udid,
          kind: 'auto-backup',
          name: null,
          reason: `Before uninstalling ${plural(apps.length)}`,
          osVersion: device.osVersion,
          deviceClass: device.deviceClass,
          rawState: await bridge.getIconState(udid)
        })
        broadcast('snapshots:changed', undefined)
      } catch (err) {
        // No backup, no deleting.
        return refuse(`Couldn’t save a backup, so nothing was removed: ${reason(err)}`)
      }

      let removed = 0
      try {
        for (const app of apps) {
          broadcast('uninstall:progress', { done: removed, total: apps.length, name: app.name })
          await bridge.uninstall(udid, app.bundleId)
          removed++
          log.info(`uninstalled ${app.bundleId}`)
        }
      } catch (err) {
        log.error('uninstall failed:', reason(err))
        return {
          ok: false,
          removed,
          message: `Couldn’t remove ${apps[removed]!.name}: ${reason(err)}`
        }
      } finally {
        broadcast('apps:changed', undefined) // the table and the home screen read the phone again
      }
      return { ok: true, removed }
    } finally {
      release()
    }
  }
}
