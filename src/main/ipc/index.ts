import type { Broadcast, SidecarStatus } from '@shared/ipc-contract'
import type { ApplyService } from '../services/ApplyService'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { CategoryService } from '../services/CategoryService'
import type { IconService } from '../services/IconService'
import type { SettingsService } from '../services/SettingsService'
import type { SnapshotService } from '../services/SnapshotService'
import { registerApplyIpc } from './apply'
import { registerAppsIpc } from './apps'
import { registerDeviceIpc } from './device'
import { registerLayoutIpc } from './layout'
import { registerSettingsIpc } from './settings'
import { registerSnapshotsIpc } from './snapshots'
import type { IpcLike } from './handle'

export interface IpcDeps {
  bridge: DeviceBridge
  broadcast: Broadcast
  icons: IconService
  categories: CategoryService
  snapshots: SnapshotService
  apply: ApplyService
  settings: SettingsService
  sidecarStatus: () => SidecarStatus
}

export function registerIpc(ipc: IpcLike, d: IpcDeps): void {
  registerDeviceIpc(ipc, d.bridge, d.broadcast)
  registerLayoutIpc(ipc, d.bridge, d.icons)
  registerAppsIpc(ipc, d.bridge, d.icons, d.categories)
  registerSnapshotsIpc(ipc, { bridge: d.bridge, snapshots: d.snapshots, broadcast: d.broadcast })
  registerApplyIpc(ipc, d.apply)
  registerSettingsIpc(ipc, d)
}
