import type { Broadcast } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { ApplyService } from '../services/ApplyService'
import type { SnapshotService } from '../services/SnapshotService'
import { handle, type IpcLike } from './handle'

export function registerApplyIpc(ipc: IpcLike, apply: ApplyService): void {
  handle(ipc, 'apply:run', (plan) => apply.apply(plan))
  handle(ipc, 'apply:switch', (udid, snapshotId) => apply.switchTo(udid, snapshotId))
  handle(ipc, 'apply:restore', (udid, snapshotId) => apply.restore(udid, snapshotId))
}

interface MenuDeps {
  bridge: DeviceBridge
  snapshots: SnapshotService
  apply: ApplyService
  broadcast: Broadcast
  // Shows the question, resolves true on "Restore". Electron's dialog in the app, a stub in tests.
  confirm: (question: string) => Promise<boolean>
}

// Device > Restore Last Backup…: the newest backup of the first ready device.
export async function restoreLastBackup({
  bridge,
  snapshots,
  apply,
  broadcast,
  confirm
}: MenuDeps): Promise<void> {
  const device = (await bridge.listDevices()).find((d) => d.state === 'ready')
  if (!device)
    return void broadcast('toast', 'Connect an unlocked iPhone or iPad to restore a backup.')
  const last = await snapshots.latest(device.udid)
  if (!last) return void broadcast('toast', 'There are no backups to restore yet.')
  const when = new Date(last.createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const label = last.name ?? last.reason ?? 'backup'
  if (!(await confirm(`Restore “${label}” from ${when}? Your current layout is backed up first.`)))
    return
  const result = await apply.restore(device.udid, last.id)
  broadcast('toast', result.ok ? `Restored “${label}”` : result.message)
}
