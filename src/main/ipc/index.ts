import type { EventName } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import { registerDeviceIpc } from './device'
import { registerLayoutIpc } from './layout'
import type { IpcLike } from './handle'

export function registerIpc(
  ipc: IpcLike,
  bridge: DeviceBridge,
  broadcast: (event: EventName) => void
): void {
  registerDeviceIpc(ipc, bridge, broadcast)
  registerLayoutIpc(ipc, bridge)
}
