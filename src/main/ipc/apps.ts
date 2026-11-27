import { gridFor } from '@shared/layout/grid'
import { appLocations } from '@shared/layout/locations'
import { normalize } from '@shared/layout/normalize'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { CategoryService } from '../services/CategoryService'
import type { ColorOverrideService } from '../services/ColorOverrideService'
import type { UninstallService } from '../services/UninstallService'
import type { IconService } from '../services/IconService'
import { handle, type IpcLike } from './handle'

export function registerAppsIpc(
  ipc: IpcLike,
  bridge: DeviceBridge,
  icons: IconService,
  categories: CategoryService,
  uninstaller: UninstallService,
  colorOverrides: ColorOverrideService
): void {
  handle(ipc, 'apps:list', async (udid) => {
    const [installed, raw] = await Promise.all([bridge.listApps(udid), bridge.getIconState(udid)])
    // The phone hides a few apps from its list that still sit on the home screen: they are apps too.
    const placed = appLocations(normalize(raw, gridFor('iPhone')))
    const known = new Set(installed.map((a) => a.bundleId))
    for (const [bundleId, { name }] of placed) {
      if (!known.has(bundleId)) installed.push({ bundleId, name, removable: false })
    }
    await icons.sync(udid, [...placed.keys(), ...known])
    const colors = await icons.colors(udid)
    const result = categories.resolve(installed)
    return {
      ...result,
      apps: result.apps.map((a) => ({
        ...a,
        iconColor: colorOverrides.apply(a.bundleId, colors[a.bundleId] ?? null)
      }))
    }
  })
  handle(ipc, 'apps:uninstall', (udid, bundleIds) => uninstaller.run(udid, bundleIds))
  handle(ipc, 'apps:overrides', () => categories.getOverrides())
  handle(ipc, 'apps:set-category', async (bundleId, name, category) => {
    try {
      await categories.setOverride(bundleId, name, category)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  })
  handle(ipc, 'apps:reset-category', (bundleId) => categories.resetOverride(bundleId))
  handle(ipc, 'apps:color-overrides', () => colorOverrides.list())
  handle(ipc, 'apps:set-color', (bundleId, name, color) =>
    colorOverrides.set(bundleId, name, color)
  )
}
