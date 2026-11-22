import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Device, RawIconState } from '@shared/types'
import type { DeviceBridge } from '../bridge/DeviceBridge'
import { ConnectBackups } from '../ConnectBackups'
import { SnapshotService } from '../SnapshotService'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const app = (id: string, extra = {}) => ({ bundleIdentifier: id, displayName: id, ...extra })
const udid = 'AB-12'
const device = (state: Device['state'] = 'ready'): Device => ({
  udid,
  name: 'Sam’s iPhone',
  productType: 'iPhone17,1',
  modelName: 'iPhone 16 Pro',
  deviceClass: 'iPhone',
  osVersion: '26.1',
  connection: 'usb',
  state
})

// A phone that can be plugged in, changed and unplugged.
function setup(enabled = true) {
  const phone = {
    state: 'ready' as Device['state'],
    raw: [[app('d')], [app('a'), app('b')]] as RawIconState
  }
  let notify = () => {}
  const bridge = {
    listDevices: async () => (phone.state === ('gone' as string) ? [] : [device(phone.state)]),
    getIconState: async () => phone.raw,
    onDevicesChanged(l: () => void) {
      notify = l
      return () => {}
    }
  } as unknown as DeviceBridge
  const snapshots = new SnapshotService(mkdtempSync(join(tmpdir(), 'jiggle-cb-')), silent)
  const broadcast = vi.fn()
  const backups = new ConnectBackups({
    bridge,
    snapshots,
    enabled: () => enabled,
    broadcast,
    log: silent
  })
  const count = async () => (await snapshots.list(udid)).length
  const plugIn = async () => {
    notify()
    await backups.check()
  }
  return { phone, backups, snapshots, broadcast, count, plugIn }
}

describe('backup on connect', () => {
  it('backs up a phone that connects with no backup yet, once per connection', async () => {
    const t = setup()
    await t.plugIn()
    await t.plugIn() // more device events while it stays connected
    expect(await t.count()).toBe(1)
    expect((await t.snapshots.list(udid))[0]).toMatchObject({
      kind: 'auto-backup',
      reason: 'Phone connected'
    })
    expect(t.broadcast).toHaveBeenCalledWith('snapshots:changed', undefined)
  })

  it('takes a new one when the layout changed since the last backup, and none when it did not', async () => {
    const t = setup()
    await t.plugIn()
    t.phone.state = 'locked' // unplugged
    await t.backups.check()
    t.phone.state = 'ready' // plugged in again, nothing changed (only an app version)
    t.phone.raw = [[app('d')], [app('a', { bundleVersion: '9' }), app('b')]]
    await t.backups.check()
    expect(await t.count()).toBe(1)

    t.phone.state = 'locked'
    await t.backups.check()
    t.phone.state = 'ready'
    t.phone.raw = [[app('d')], [app('b'), app('a')]] // an icon moved
    await t.backups.check()
    expect(await t.count()).toBe(2)
  })

  it('does nothing with the setting off, or for a phone that is not ready', async () => {
    const off = setup(false)
    await off.plugIn()
    expect(await off.count()).toBe(0)
    const locked = setup()
    locked.phone.state = 'locked'
    await locked.plugIn()
    expect(await locked.count()).toBe(0)
  })

  it('tries again at the next event when the read failed', async () => {
    const t = setup()
    const read = vi.spyOn(t.snapshots, 'latest').mockRejectedValueOnce(new Error('boom'))
    await t.plugIn()
    expect(await t.count()).toBe(0)
    await t.plugIn()
    expect(await t.count()).toBe(1)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
