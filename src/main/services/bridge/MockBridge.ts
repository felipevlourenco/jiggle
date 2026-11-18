import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { schemas } from '@shared/ipc-contract'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Device, Grid, InstalledApp, LayoutItem, RawIconState, Udid } from '@shared/types'
import type { DeviceBridge } from './DeviceBridge'

const Fixture = z.object({ device: schemas.Device, rawState: schemas.RawIconState })
export type Fixture = z.infer<typeof Fixture>

export function loadFixture(dir: string, name: string): Fixture {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad fixture name: ${name}`)
  return Fixture.parse(JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')))
}

// Serves one recorded device (or none) from memory. Used for dev, tests and E2E.
export class MockBridge implements DeviceBridge {
  // The mock phone remembers what is written to it, so apply and restore can be tried without a phone.
  private rawState: RawIconState | null

  constructor(private readonly fixture: Fixture | null = null) {
    this.rawState = fixture ? structuredClone(fixture.rawState) : null
  }

  async listDevices(): Promise<Device[]> {
    return this.fixture ? [this.fixture.device] : []
  }

  async refreshDevice(): Promise<void> {}

  async getIconState(udid: Udid): Promise<RawIconState> {
    if (!this.fixture || this.fixture.device.udid !== udid)
      throw new Error(`Unknown device: ${udid}`)
    return structuredClone(this.rawState!)
  }

  async setIconState(udid: Udid, state: RawIconState): Promise<void> {
    if (!this.fixture || this.fixture.device.udid !== udid)
      throw new Error(`Unknown device: ${udid}`)
    this.rawState = structuredClone(state)
  }

  // The mock has no phone to ask: the UI falls back to the default grid, letter tiles and a gradient.
  async getIconMetrics(): Promise<Grid | null> {
    return null
  }

  async getIcons(): Promise<Map<string, Buffer>> {
    return new Map()
  }

  // The mock has no installation proxy: every app on the home screen counts as installed.
  async listApps(udid: Udid): Promise<InstalledApp[]> {
    const { dock, pages } = normalize(await this.getIconState(udid), gridFor('iPhone'))
    const apps = new Map<string, InstalledApp>()
    const visit = (item: LayoutItem): void => {
      if (item.kind === 'folder') item.pages.flat().forEach(visit)
      else if (item.kind === 'app') {
        apps.set(item.bundleId, {
          bundleId: item.bundleId,
          name: item.name,
          removable: !item.bundleId.startsWith('com.apple.')
        })
      }
    }
    ;[...dock, ...pages.flat()].forEach(visit)
    return [...apps.values()]
  }

  onDevicesChanged(): () => void {
    return () => {}
  }
}
