import type { Broadcast } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import { registerDeviceIpc } from './device'
import { registerLayoutIpc } from './layout'
import type { IpcLike } from './handle'

export function registerIpc(ipc: IpcLike, bridge: DeviceBridge, broadcast: Broadcast): void {
  registerDeviceIpc(ipc, bridge, broadcast)
  registerLayoutIpc(ipc, bridge)
}
