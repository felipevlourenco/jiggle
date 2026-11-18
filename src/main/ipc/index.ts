import type { Broadcast } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { IconService } from '../services/IconService'
import { registerDeviceIpc } from './device'
import { registerLayoutIpc } from './layout'
import type { IpcLike } from './handle'

export function registerIpc(
  ipc: IpcLike,
  bridge: DeviceBridge,
  broadcast: Broadcast,
  icons: IconService
): void {
  registerDeviceIpc(ipc, bridge, broadcast)
  registerLayoutIpc(ipc, bridge, icons)
}
