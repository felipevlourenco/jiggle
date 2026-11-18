import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { sortLayout } from '@shared/layout/sort'
import type { ApplyPlan, ApplyResult, RawIconState } from '@shared/types'
import { restoreLastBackup } from '../../ipc/apply'
import { MockBridge, loadFixture } from '../bridge/MockBridge'
import { ApplyService } from '../ApplyService'
import { SnapshotService } from '../SnapshotService'
import { snapshotsDir } from '../storage/paths'

const fixtures = join(__dirname, '../../../../tests/fixtures')
const silent = { debug() {}, info() {}, warn() {}, error() {} }

function setup(fixtureName = 'iphone-widgets') {
  const fixture = loadFixture(fixtures, fixtureName)
  const bridge = new MockBridge(fixture)
  const root = mkdtempSync(join(tmpdir(), 'jiggle-apply-'))
  const snapshots = new SnapshotService(root, silent)
  const broadcast = vi.fn()
  const service = new ApplyService({ bridge, snapshots, broadcast, log: silent })
  const udid = fixture.device.udid
  const original = fixture.rawState
  const before = normalize(original, gridFor('iPhone'))
  const after = sortLayout(before, { by: 'name', widgetMode: 'keep-pages' })
  const plan = (patch: Partial<ApplyPlan> = {}): ApplyPlan => ({
    udid,
    reason: 'A–Z sort',
    beforeSignature: layoutSignature(original),
    after,
    removedFromHomeScreen: [],
    ...patch
  })
  const phone = async (): Promise<string> => layoutSignature(await bridge.getIconState(udid))
  const ok = (r: ApplyResult) => {
    if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`)
    return r
  }
  return {
    fixture,
    bridge,
    root,
    snapshots,
    broadcast,
    service,
    udid,
    original,
    before,
    after,
    plan,
    phone,
    ok
  }
}

describe('ApplyService.apply', () => {
  it('backs up, writes, verifies, and the backup is the original layout', async () => {
    const t = setup()
    const { backup } = t.ok(await t.service.apply(t.plan()))
    expect(await t.phone()).toBe(layoutSignature(serialize(t.after)))
    expect(await t.phone()).not.toBe(layoutSignature(t.original))
    expect(backup).toMatchObject({ kind: 'auto-backup', reason: 'Before A–Z sort' })
    expect((await t.snapshots.get(t.udid, backup.id)).rawState).toEqual(t.original)
  })

  it('reports the steps in order', async () => {
    const t = setup()
    await t.service.apply(t.plan())
    const steps = t.broadcast.mock.calls.filter(([e]) => e === 'apply:progress').map(([, s]) => s)
    expect(steps).toEqual(['checking', 'backing-up', 'writing', 'verifying'])
  })

  it('writes nothing when the phone changed since the preview', async () => {
    const t = setup()
    const moved: RawIconState = structuredClone(t.original)
    moved[1] = [...moved[1]!].reverse() // someone rearranged page 1 on the phone
    await t.bridge.setIconState(t.udid, moved)
    const result = await t.service.apply(t.plan())
    expect(result).toMatchObject({ ok: false, code: 'layout-changed' })
    expect(await t.phone()).toBe(layoutSignature(moved))
    expect(await t.snapshots.list(t.udid)).toEqual([])
  })

  it('writes nothing when the new layout is invalid', async () => {
    const t = setup()
    const lost = { ...t.after, pages: t.after.pages.map((p) => p.slice(1)) } // an app from every page is gone
    const result = await t.service.apply(t.plan({ after: lost }))
    expect(result).toMatchObject({ ok: false, code: 'invalid' })
    expect(result.ok ? '' : result.message).toContain('would be lost')
    expect(await t.phone()).toBe(layoutSignature(t.original))
    expect(await t.snapshots.list(t.udid)).toEqual([])
  })

  it('runs one change at a time: a double click makes one backup', async () => {
    const t = setup()
    const [a, b] = await Promise.all([t.service.apply(t.plan()), t.service.apply(t.plan())])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 'busy' })
    expect(await t.snapshots.list(t.udid)).toHaveLength(1)
  })

  it('keeps the backup and says so when the write fails', async () => {
    const t = setup()
    vi.spyOn(t.bridge, 'setIconState').mockRejectedValue(new Error('device disconnected'))
    const result = await t.service.apply(t.plan())
    expect(result).toMatchObject({ ok: false, code: 'write-failed' })
    expect(result.ok ? '' : result.message).toContain('device disconnected')
    expect(!result.ok && result.backup?.reason).toBe('Before A–Z sort')
    expect(await t.phone()).toBe(layoutSignature(t.original))
  })

  it('says "Apply interrupted" and keeps a restorable backup when the phone is unplugged mid-write', async () => {
    const t = setup()
    const devices = await t.bridge.listDevices()
    vi.spyOn(t.bridge, 'setIconState').mockRejectedValue(new Error('usbmux: device gone'))
    // the phone is there for the checks, gone by the time the write has failed
    vi.spyOn(t.bridge, 'listDevices').mockResolvedValueOnce(devices).mockResolvedValue([])
    const result = await t.service.apply(t.plan())
    expect(result).toMatchObject({ ok: false, code: 'interrupted' })
    expect(result.ok ? '' : result.message).toMatch(
      /disconnected while writing.*restore the backup from \d/
    )
    // reconnected: the backup puts the original layout back
    vi.restoreAllMocks()
    const restored = await t.service.restore(t.udid, (!result.ok && result.backup!.id) as string)
    expect(restored.ok).toBe(true)
    expect(await t.phone()).toBe(layoutSignature(t.original))
  })

  it('logs every refusal with its error code', async () => {
    const warn = vi.fn()
    const t = setup()
    const logged = new ApplyService({
      bridge: t.bridge,
      snapshots: t.snapshots,
      broadcast: t.broadcast,
      log: { ...silent, warn }
    })
    await logged.apply(t.plan({ beforeSignature: 'something else' }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[layout-changed]'))
  })

  it('does not write at all if the backup cannot be saved', async () => {
    const t = setup()
    writeFileSync(join(t.root, 'devices'), 'a file where the folder should be') // mkdir will fail
    const spy = vi.spyOn(t.bridge, 'setIconState')
    expect(await t.service.apply(t.plan())).toMatchObject({ ok: false, code: 'write-failed' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('catches a phone that did not keep the layout', async () => {
    const t = setup()
    vi.spyOn(t.bridge, 'setIconState').mockResolvedValue() // pretends to write, keeps the old layout
    const result = await t.service.apply(t.plan())
    expect(result).toMatchObject({ ok: false, code: 'verify-failed' })
    expect(!result.ok && result.backup).toBeTruthy()
  })

  it('refuses a read-only device and an unknown one', async () => {
    const ro = setup('iphone-ios16')
    expect(await ro.service.apply(ro.plan())).toMatchObject({ ok: false, code: 'read-only' })
    const t = setup()
    expect(await t.service.apply(t.plan({ udid: 'NOPE-1' }))).toMatchObject({
      ok: false,
      code: 'no-device'
    })
  })
})

describe('ApplyService.restore', () => {
  it('puts the original layout back, after backing up the current one', async () => {
    const t = setup()
    const { backup } = t.ok(await t.service.apply(t.plan()))
    const restored = t.ok(await t.service.restore(t.udid, backup.id))
    expect(await t.phone()).toBe(layoutSignature(t.original))
    expect(restored.backup.reason).toContain('Before restoring')
    // the "undo" is itself restorable: restoring it brings the sorted layout back
    t.ok(await t.service.restore(t.udid, restored.backup.id))
    expect(await t.phone()).toBe(layoutSignature(serialize(t.after)))
  })

  it('refuses a missing or damaged backup and writes nothing', async () => {
    const t = setup()
    expect(await t.service.restore(t.udid, '01ARZ3NDEKTSV4RRFFQ69G5FAV')).toMatchObject({
      ok: false,
      code: 'not-found'
    })
    const { backup } = t.ok(await t.service.apply(t.plan()))
    writeFileSync(join(snapshotsDir(t.root, t.udid), `${backup.id}.json`), '{ broken')
    const result = await t.service.restore(t.udid, backup.id)
    expect(result).toMatchObject({ ok: false, code: 'not-found' })
    expect(result.ok ? '' : result.message).toContain('damaged')
    expect(await t.phone()).toBe(layoutSignature(serialize(t.after)))
  })
})

describe('Device > Restore Last Backup', () => {
  it('asks first, then restores the newest backup', async () => {
    const t = setup()
    t.ok(await t.service.apply(t.plan()))
    const confirm = vi.fn(async () => true)
    await restoreLastBackup({
      bridge: t.bridge,
      snapshots: t.snapshots,
      apply: t.service,
      broadcast: t.broadcast,
      confirm
    })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Before A–Z sort'))
    expect(await t.phone()).toBe(layoutSignature(t.original))
    expect(t.broadcast).toHaveBeenCalledWith('toast', expect.stringContaining('Restored'))
  })

  it('does nothing when the person says no, or there are no backups', async () => {
    const t = setup()
    const deps = {
      bridge: t.bridge,
      snapshots: t.snapshots,
      apply: t.service,
      broadcast: t.broadcast
    }
    await restoreLastBackup({ ...deps, confirm: async () => true })
    expect(t.broadcast).toHaveBeenCalledWith('toast', 'There are no backups to restore yet.')
    t.ok(await t.service.apply(t.plan()))
    await restoreLastBackup({ ...deps, confirm: async () => false })
    expect(await t.phone()).toBe(layoutSignature(serialize(t.after)))
  })
})
