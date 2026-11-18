import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { schemas } from '@shared/ipc-contract'
import type { Device, Grid, RawIconState, Udid } from '@shared/types'
import type { DeviceBridge } from './DeviceBridge'

const Fixture = z.object({ device: schemas.Device, rawState: schemas.RawIconState })
export type Fixture = z.infer<typeof Fixture>

export function loadFixture(dir: string, name: string): Fixture {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad fixture name: ${name}`)
  return Fixture.parse(JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')))
}

// Serves one recorded device (or none) from memory. Used for dev, tests and E2E.
export class MockBridge implements DeviceBridge {
  constructor(private readonly fixture: Fixture | null = null) {}

  async listDevices(): Promise<Device[]> {
    return this.fixture ? [this.fixture.device] : []
  }

  async refreshDevice(): Promise<void> {}

  async getIconState(udid: Udid): Promise<RawIconState> {
    if (!this.fixture || this.fixture.device.udid !== udid)
      throw new Error(`Unknown device: ${udid}`)
    return this.fixture.rawState
  }

  // The mock has no phone to ask: the UI falls back to the default grid, letter tiles and a gradient.
  async getIconMetrics(): Promise<Grid | null> {
    return null
  }

  async getIcons(): Promise<Map<string, Buffer>> {
    return new Map()
  }

  async getWallpaper(): Promise<Buffer | null> {
    return null
  }

  onDevicesChanged(): () => void {
    return () => {}
  }
}
