import type { Broadcast } from '@shared/ipc-contract'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import { handle, type IpcLike } from './handle'

export function registerDeviceIpc(ipc: IpcLike, bridge: DeviceBridge, broadcast: Broadcast): void {
  handle(ipc, 'device:list', () => bridge.listDevices())
  bridge.onDevicesChanged(() => broadcast('device:changed', undefined))
}
