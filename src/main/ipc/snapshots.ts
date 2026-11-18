import type { Broadcast } from '@shared/ipc-contract'
import type { SnapshotSummary, Udid } from '@shared/types'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { SnapshotService } from '../services/SnapshotService'
import { handle, type IpcLike } from './handle'

interface Deps {
  bridge: DeviceBridge
  snapshots: SnapshotService
  broadcast: Broadcast
}

// Reads the phone's icon state as it is right now and saves it. Shows a toast either way.
export async function backUpNow(
  { bridge, snapshots, broadcast }: Deps,
  udid: Udid
): Promise<SnapshotSummary> {
  try {
    const [rawState, devices] = await Promise.all([bridge.getIconState(udid), bridge.listDevices()])
    const made = await snapshots.create({
      udid,
      kind: 'auto-backup',
      name: null,
      reason: 'Manual backup',
      osVersion: devices.find((d) => d.udid === udid)?.osVersion ?? '',
      rawState
    })
    broadcast('snapshots:changed', undefined)
    broadcast('toast', `Backed up · ${made.appCount} apps`)
    return made
  } catch (err) {
    broadcast('toast', `Couldn’t back up: ${(err as Error).message}`)
    throw err
  }
}

// Device > Back Up Now: the active device is the first ready one, as in the window.
export async function backUpActiveDevice(deps: Deps): Promise<void> {
  const device = (await deps.bridge.listDevices()).find((d) => d.state === 'ready')
  if (!device) {
    deps.broadcast('toast', 'Connect an unlocked iPhone to back it up.')
    return
  }
  await backUpNow(deps, device.udid).catch(() => {}) // already toasted
}

export function registerSnapshotsIpc(ipc: IpcLike, deps: Deps): void {
  handle(ipc, 'snapshots:list', (udid) => deps.snapshots.list(udid))
  handle(ipc, 'snapshots:backup', (udid) => backUpNow(deps, udid))
}
