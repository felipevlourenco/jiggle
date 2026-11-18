import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { appLocations } from '@shared/layout/locations'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { IconService } from '../services/IconService'
import { handle, type IpcLike } from './handle'

export function registerLayoutIpc(ipc: IpcLike, bridge: DeviceBridge, icons: IconService): void {
  handle(ipc, 'layout:get', async (udid) => {
    const [raw, reported, devices] = await Promise.all([
      bridge.getIconState(udid),
      bridge.getIconMetrics(udid),
      bridge.listDevices()
    ])
    const deviceClass = devices.find((d) => d.udid === udid)?.deviceClass ?? 'iPhone'
    const layout = normalize(raw, gridFor(deviceClass, reported))
    await icons.sync(udid, [...appLocations(layout).keys()])
    return { layout }
  })
}
