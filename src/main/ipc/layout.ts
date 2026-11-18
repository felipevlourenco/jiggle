import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Layout, LayoutItem } from '@shared/types'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { IconService } from '../services/IconService'
import { handle, type IpcLike } from './handle'

function bundleIdsOf(layout: Layout): string[] {
  const ids: string[] = []
  const visit = (item: LayoutItem): void => {
    if (item.kind === 'app') ids.push(item.bundleId)
    else if (item.kind === 'folder') item.pages.flat().forEach(visit)
  }
  ;[...layout.dock, ...layout.pages.flat()].forEach(visit)
  return ids
}

export function registerLayoutIpc(ipc: IpcLike, bridge: DeviceBridge, icons: IconService): void {
  handle(ipc, 'layout:get', async (udid) => {
    const [raw, reported, devices] = await Promise.all([
      bridge.getIconState(udid),
      bridge.getIconMetrics(udid),
      bridge.listDevices()
    ])
    const deviceClass = devices.find((d) => d.udid === udid)?.deviceClass ?? 'iPhone'
    const layout = normalize(raw, gridFor(deviceClass, reported))
    await icons.sync(udid, bundleIdsOf(layout))
    return { layout }
  })
}
