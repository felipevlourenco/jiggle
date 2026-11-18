import type { Broadcast } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { CategoryService } from '../services/CategoryService'
import type { ApplyService } from '../services/ApplyService'
import type { IconService } from '../services/IconService'
import type { SnapshotService } from '../services/SnapshotService'
import { registerApplyIpc } from './apply'
import { registerAppsIpc } from './apps'
import { registerDeviceIpc } from './device'
import { registerLayoutIpc } from './layout'
import { registerSnapshotsIpc } from './snapshots'
import type { IpcLike } from './handle'

export function registerIpc(
  ipc: IpcLike,
  bridge: DeviceBridge,
  broadcast: Broadcast,
  icons: IconService,
  categories: CategoryService,
  snapshots: SnapshotService,
  apply: ApplyService
): void {
  registerDeviceIpc(ipc, bridge, broadcast)
  registerLayoutIpc(ipc, bridge, icons)
  registerAppsIpc(ipc, bridge, icons, categories)
  registerSnapshotsIpc(ipc, { bridge, snapshots, broadcast })
  registerApplyIpc(ipc, apply)
}
