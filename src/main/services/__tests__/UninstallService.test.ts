import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MockBridge, loadFixture } from '../bridge/MockBridge'
import { ApplyService } from '../ApplyService'
import { SnapshotService } from '../SnapshotService'
import { UninstallService } from '../UninstallService'

const fixture = loadFixture(join(__dirname, '../../../../tests/fixtures'), 'iphone-basic')
const udid = fixture.device.udid
const silent = { debug() {}, info() {}, warn() {}, error() {} }

function setup(name = 'iphone-basic') {
  const f =
    name === 'iphone-basic'
      ? fixture
      : loadFixture(join(__dirname, '../../../../tests/fixtures'), name)
  const bridge = new MockBridge(f)
  const root = mkdtempSync(join(tmpdir(), 'jiggle-uninstall-'))
  const snapshots = new SnapshotService(root, silent)
  const broadcast = vi.fn()
  const apply = new ApplyService({ bridge, snapshots, broadcast, log: silent })
  const service = new UninstallService({ bridge, snapshots, apply, broadcast, log: silent })
  const removable = async (n: number) =>
    (await bridge.listApps(f.device.udid)).filter((a) => a.removable).slice(0, n)
  return { f, bridge, root, snapshots, broadcast, apply, service, removable }
}

describe('UninstallService', () => {
  it('backs the layout up, removes the apps one by one with progress, and tells the window', async () => {
    const t = setup()
    const [a, b] = await t.removable(2)
    const result = await t.service.run(udid, [a!.bundleId, b!.bundleId])
    expect(result).toEqual({ ok: true, removed: 2 })

    const left = (await t.bridge.listApps(udid)).map((x) => x.bundleId)
    expect(left).not.toContain(a!.bundleId)
    expect(left).not.toContain(b!.bundleId)
    expect(JSON.stringify(await t.bridge.getIconState(udid))).not.toContain(a!.bundleId)

    const [backup] = await t.snapshots.list(udid)
    expect(backup).toMatchObject({ kind: 'auto-backup', reason: 'Before uninstalling 2 apps' })
    const progress = t.broadcast.mock.calls
      .filter(([e]) => e === 'uninstall:progress')
      .map(([, p]) => p)
    expect(progress).toEqual([
      { done: 0, total: 2, name: a!.name },
      { done: 1, total: 2, name: b!.name }
    ])
    expect(t.broadcast).toHaveBeenCalledWith('apps:changed', undefined)
  })

  it('the backup still has the apps on the home screen (restoring brings back the icons, not the apps)', async () => {
    const t = setup()
    const [a] = await t.removable(1)
    await t.service.run(udid, [a!.bundleId])
    const [backup] = await t.snapshots.list(udid)
    const saved = await t.snapshots.get(udid, backup!.id)
    expect(JSON.stringify(saved.rawState)).toContain(a!.bundleId)
  })

  it('refuses a system app, or one it does not know, before touching anything', async () => {
    const t = setup()
    const [a] = await t.removable(1)
    const before = JSON.stringify(await t.bridge.getIconState(udid))
    const uninstall = vi.spyOn(t.bridge, 'uninstall')

    const system = await t.service.run(udid, [a!.bundleId, 'com.apple.mobilesafari'])
    expect(system).toMatchObject({
      ok: false,
      removed: 0,
      message: expect.stringContaining('can’t be removed')
    })
    expect(await t.service.run(udid, ['not.installed'])).toMatchObject({ ok: false, removed: 0 })
    expect(uninstall).not.toHaveBeenCalled()
    expect(JSON.stringify(await t.bridge.getIconState(udid))).toBe(before)
    expect(await t.snapshots.list(udid)).toEqual([]) // no backup for nothing
  })

  it('removes nothing when the backup can’t be saved', async () => {
    const t = setup()
    writeFileSync(join(t.root, 'devices'), 'a file where the folder should be')
    const [a] = await t.removable(1)
    const uninstall = vi.spyOn(t.bridge, 'uninstall')
    const result = await t.service.run(udid, [a!.bundleId])
    expect(result).toMatchObject({
      ok: false,
      removed: 0,
      message: expect.stringContaining('nothing was removed')
    })
    expect(uninstall).not.toHaveBeenCalled()
  })

  it('stops at the first failure and says how many went before it', async () => {
    const t = setup()
    const [a, b, c] = await t.removable(3)
    const real = t.bridge.uninstall.bind(t.bridge)
    vi.spyOn(t.bridge, 'uninstall').mockImplementation(async (u, id) => {
      if (id === b!.bundleId) throw new Error('device disconnected')
      return real(u, id)
    })
    const result = await t.service.run(udid, [a!.bundleId, b!.bundleId, c!.bundleId])
    expect(result).toEqual({
      ok: false,
      removed: 1,
      message: `Couldn’t remove ${b!.name}: device disconnected`
    })
    const left = (await t.bridge.listApps(udid)).map((x) => x.bundleId)
    expect(left).toContain(c!.bundleId) // never reached
    expect(t.broadcast).toHaveBeenCalledWith('apps:changed', undefined) // the table is still refreshed
  })

  it('refuses a locked or read-only phone, and while another change is running', async () => {
    const ro = setup('iphone-locked')
    expect(await ro.service.run(ro.f.device.udid, ['x.y'])).toMatchObject({ ok: false, removed: 0 })

    const t = setup()
    const [a] = await t.removable(1)
    const release = t.apply.lock(udid)!
    expect(await t.service.run(udid, [a!.bundleId])).toMatchObject({
      ok: false,
      message: expect.stringContaining('already running')
    })
    release()
    expect(await t.service.run(udid, [a!.bundleId])).toMatchObject({ ok: true })
  })

  it('counts an app named twice once', async () => {
    const t = setup()
    const [a] = await t.removable(1)
    expect(await t.service.run(udid, [a!.bundleId, a!.bundleId])).toEqual({ ok: true, removed: 1 })
  })
})
