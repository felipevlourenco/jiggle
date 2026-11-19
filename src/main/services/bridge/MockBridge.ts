import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { schemas } from '@shared/ipc-contract'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type {
  Device,
  Grid,
  InstalledApp,
  LayoutItem,
  RawIconState,
  RawItem,
  Udid
} from '@shared/types'
import type { DeviceBridge } from './DeviceBridge'

const Fixture = z.object({ device: schemas.Device, rawState: schemas.RawIconState })
export type Fixture = z.infer<typeof Fixture>

export function loadFixture(dir: string, name: string): Fixture {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad fixture name: ${name}`)
  return Fixture.parse(JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')))
}

// Serves recorded devices (none, one or several) from memory. Used for dev, tests and E2E.
export class MockBridge implements DeviceBridge {
  // Each mock phone remembers what is written to it, so apply and restore can be tried without a phone.
  private readonly phones = new Map<
    Udid,
    { fixture: Fixture; rawState: RawIconState; uninstalled: Set<string> }
  >()

  constructor(fixtures: Fixture | Fixture[] | null = null) {
    for (const fixture of [fixtures ?? []].flat()) {
      this.phones.set(fixture.device.udid, {
        fixture,
        rawState: structuredClone(fixture.rawState),
        uninstalled: new Set()
      })
    }
  }

  async listDevices(): Promise<Device[]> {
    return [...this.phones.values()].map((p) => p.fixture.device)
  }

  async refreshDevice(): Promise<void> {}

  async getIconState(udid: Udid): Promise<RawIconState> {
    return structuredClone(this.phone(udid).rawState)
  }

  async setIconState(udid: Udid, state: RawIconState): Promise<void> {
    this.phone(udid).rawState = structuredClone(state)
  }

  // The mock has no phone to ask: the UI falls back to the default grid, letter tiles and a gradient.
  async getIconMetrics(): Promise<Grid | null> {
    return null
  }

  async getIcons(): Promise<Map<string, Buffer>> {
    return new Map()
  }

  // The mock has no installation proxy: every app on the recorded home screen counts as installed,
  // so an app sent to the App Library stays in the list (an uninstalled one does not).
  async listApps(udid: Udid): Promise<InstalledApp[]> {
    const { fixture, uninstalled } = this.phone(udid)
    const { dock, pages } = normalize(fixture.rawState, gridFor(fixture.device.deviceClass))
    const apps = new Map<string, InstalledApp>()
    const visit = (item: LayoutItem): void => {
      if (item.kind === 'folder') item.pages.flat().forEach(visit)
      else if (item.kind === 'app' && !uninstalled.has(item.bundleId)) {
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

  // Like the phone: only a user app can go, and its icon leaves the home screen (an emptied folder goes too).
  async uninstall(udid: Udid, bundleId: string): Promise<void> {
    const phone = this.phone(udid)
    if (bundleId.startsWith('com.apple.')) throw new Error(`${bundleId} can't be removed`)
    phone.uninstalled.add(bundleId)
    const idOf = (i: RawItem): unknown => i['bundleIdentifier'] ?? i['displayIdentifier']
    phone.rawState = phone.rawState.map((page) =>
      page.flatMap((item) => {
        if (item['listType'] !== 'folder') return idOf(item) === bundleId ? [] : [item]
        const lists = (item['iconLists'] as RawItem[][]).map((l) =>
          l.filter((i) => idOf(i) !== bundleId)
        )
        const kept = lists.filter((l) => l.length > 0)
        return kept.length ? [{ ...item, iconLists: kept }] : []
      })
    )
  }

  onDevicesChanged(): () => void {
    return () => {}
  }

  private phone(udid: Udid): {
    fixture: Fixture
    rawState: RawIconState
    uninstalled: Set<string>
  } {
    const phone = this.phones.get(udid)
    if (!phone) throw new Error(`Unknown device: ${udid}`)
    return phone
  }
}
