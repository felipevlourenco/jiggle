import type { Broadcast, SidecarStatus } from '@shared/ipc-contract'
import type { ApplyService } from '../services/ApplyService'
import type { UninstallService } from '../services/UninstallService'
import type { ExportService } from '../services/ExportService'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { CategoryService } from '../services/CategoryService'
import type { IconService } from '../services/IconService'
import type { PinsService } from '../services/PinsService'
import type { SettingsService } from '../services/SettingsService'
import type { SnapshotService } from '../services/SnapshotService'
import { registerApplyIpc } from './apply'
import { registerAppsIpc } from './apps'
import { registerDeviceIpc } from './device'
import { registerExportIpc } from './export'
import { registerLayoutIpc } from './layout'
import { registerSettingsIpc } from './settings'
import { registerSnapshotsIpc, type LayoutFileDialogs } from './snapshots'
import type { IpcLike } from './handle'

export interface IpcDeps {
  bridge: DeviceBridge
  broadcast: Broadcast
  icons: IconService
  categories: CategoryService
  snapshots: SnapshotService
  apply: ApplyService
  exporter: ExportService
  layoutFiles: LayoutFileDialogs
  uninstaller: UninstallService
  settings: SettingsService
  pins: PinsService
  sidecarStatus: () => SidecarStatus
}

export function registerIpc(ipc: IpcLike, d: IpcDeps): void {
  registerDeviceIpc(ipc, d.bridge, d.broadcast)
  registerLayoutIpc(ipc, d.bridge, d.icons)
  registerAppsIpc(ipc, d.bridge, d.icons, d.categories, d.uninstaller)
  registerSnapshotsIpc(ipc, {
    bridge: d.bridge,
    snapshots: d.snapshots,
    broadcast: d.broadcast,
    dialogs: d.layoutFiles
  })
  registerApplyIpc(ipc, d.apply)
  registerExportIpc(ipc, d.exporter)
  registerSettingsIpc(ipc, d)
}
