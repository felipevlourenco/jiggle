import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import { handle, type IpcLike } from './handle'

export function registerLayoutIpc(ipc: IpcLike, bridge: DeviceBridge): void {
  handle(ipc, 'layout:get', (udid) => bridge.getIconState(udid))
}
