import type { Broadcast } from '@shared/ipc-contract'
import { layoutSignature } from '@shared/layout/signature'
import type { Device } from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import type { SnapshotService } from './SnapshotService'

// With the setting on: when a phone becomes ready (plugged in, unlocked, trusted), back it up if its
// layout differs from its newest snapshot. A phone is checked once per connection; unplug and plug
// in again to check it again. A failed read is retried at the next device event.
export class ConnectBackups {
  private readonly checked = new Set<string>() // ready devices already looked at

  constructor(
    private readonly o: {
      bridge: DeviceBridge
      snapshots: SnapshotService
      enabled: () => boolean
      broadcast: Broadcast
      log: Logger
    }
  ) {}

  start(): () => void {
    const stop = this.o.bridge.onDevicesChanged(() => void this.check())
    void this.check() // a phone that was already plugged in
    return stop
  }

  async check(): Promise<void> {
    if (!this.o.enabled()) return
    const ready = (await this.o.bridge.listDevices().catch(() => [] as Device[])).filter(
      (d) => d.state === 'ready'
    )
    for (const udid of this.checked)
      if (!ready.some((d) => d.udid === udid)) this.checked.delete(udid)
    for (const device of ready) {
      if (this.checked.has(device.udid)) continue
      this.checked.add(device.udid)
      await this.backUpIfChanged(device).catch((err: Error) => {
        this.checked.delete(device.udid)
        this.o.log.warn(`backup on connect failed for ${device.udid}:`, err.message)
      })
    }
  }

  private async backUpIfChanged({ udid, osVersion, deviceClass }: Device): Promise<void> {
    const { bridge, snapshots, broadcast, log } = this.o
    const rawState = await bridge.getIconState(udid)
    const last = await snapshots.latest(udid)
    if (last) {
      const before = (await snapshots.get(udid, last.id)).rawState
      if (layoutSignature(before) === layoutSignature(rawState)) return
    }
    await snapshots.create({
      udid,
      kind: 'auto-backup',
      name: null,
      reason: 'Phone connected',
      osVersion,
      deviceClass,
      rawState
    })
    log.info(`backed up ${udid} on connect`)
    broadcast('snapshots:changed', undefined)
  }
}
