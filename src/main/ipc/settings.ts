import type { SidecarStatus } from '@shared/ipc-contract'
import type { CategoryService } from '../services/CategoryService'
import type { IconService } from '../services/IconService'
import type { SettingsService } from '../services/SettingsService'
import { handle, type IpcLike } from './handle'

export function registerSettingsIpc(
  ipc: IpcLike,
  deps: {
    settings: SettingsService
    categories: CategoryService
    icons: IconService
    sidecarStatus: () => SidecarStatus
  }
): void {
  handle(ipc, 'settings:get', () => deps.settings.get())
  handle(ipc, 'settings:set', (patch) => deps.settings.set(patch))
  handle(ipc, 'settings:clear-cache', async () => {
    await deps.categories.clear()
    await deps.icons.clear()
  })
  handle(ipc, 'sidecar:get', () => deps.sidecarStatus())
}
