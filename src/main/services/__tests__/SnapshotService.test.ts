import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawIconState } from '@shared/types'
import { SnapshotService } from '../SnapshotService'
import { snapshotsDir } from '../storage/paths'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const app = (id: string) => ({ bundleIdentifier: id, displayName: id })
const rawState: RawIconState = [[app('dock.a')], [app('a.one'), app('a.two')], [app('b.one')]]
const input = {
  udid: 'AB-12',
  kind: 'auto-backup',
  name: null,
  reason: 'Test',
  osVersion: '26.1',
  rawState
} as const

function setup(opts: ConstructorParameters<typeof SnapshotService>[2] = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jiggle-snap-'))
  let clock = Date.UTC(2026, 10, 18, 9, 0)
  const service = new SnapshotService(root, silent, { now: () => (clock += 1000), ...opts })
  return { root, service, dir: snapshotsDir(root, 'AB-12') }
}

describe('SnapshotService', () => {
  it('saves a readable JSON file with the exact state and the counts the Home Screen shows', async () => {
    const { service, dir } = setup()
    const made = await service.create(input)
    expect(made).toMatchObject({ appCount: 4, pageCount: 2, reason: 'Test', damaged: false })
    expect(made.page1).toEqual(rawState[1])
    const files = readdirSync(dir)
    expect(files).toEqual([`${made.id}.json`])
    const onDisk = JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'))
    expect(onDisk.rawState).toEqual(rawState) // restoring writes this back unchanged
    expect(made.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('lists newest first, and still lists them for a new service instance (after a relaunch)', async () => {
    const { root, service } = setup()
    const a = await service.create(input)
    const b = await service.create(input)
    const relaunched = new SnapshotService(root, silent)
    expect((await relaunched.list('AB-12')).map((e) => e.id)).toEqual([b.id, a.id])
  })

  it('the 51st automatic backup deletes the oldest', async () => {
    const { service, dir } = setup()
    const first = await service.create(input)
    for (let i = 0; i < 49; i++) await service.create(input)
    expect(readdirSync(dir)).toHaveLength(50)
    const newest = await service.create(input) // the 51st
    const files = readdirSync(dir)
    expect(files).toHaveLength(50)
    expect(files).not.toContain(`${first.id}.json`)
    expect(files).toContain(`${newest.id}.json`)
  })

  it('never prunes saved layouts', async () => {
    const { service, dir } = setup({ keepAutoBackups: () => 2 })
    const saved = await service.create({
      ...input,
      kind: 'saved-layout',
      name: 'Work',
      reason: null
    })
    for (let i = 0; i < 4; i++) await service.create(input)
    const files = readdirSync(dir)
    expect(files).toHaveLength(3) // 2 backups + the saved layout
    expect(files).toContain(`${saved.id}.json`)
  })

  it('lists a damaged file as damaged instead of failing, and keeps it', async () => {
    const { service, dir } = setup()
    const good = await service.create(input)
    writeFileSync(join(dir, '01ARZ3NDEKTSV4RRFFQ69G5FAV.json'), '{ not json')
    writeFileSync(join(dir, '01ARZ3NDEKTSV4RRFFQ69G5FAW.json'), JSON.stringify({ id: 'x' })) // wrong shape
    const entries = await service.list('AB-12')
    expect(entries.filter((e) => e.damaged)).toHaveLength(2)
    expect(entries.find((e) => !e.damaged)?.id).toBe(good.id)
    for (let i = 0; i < 3; i++) await service.create(input) // pruning doesn't touch them
    expect(readdirSync(dir)).toContain('01ARZ3NDEKTSV4RRFFQ69G5FAV.json')
  })

  it('lists every device when no udid is given, and nothing when there are none', async () => {
    const { service } = setup()
    expect(await service.list()).toEqual([])
    await service.create(input)
    await service.create({ ...input, udid: 'CD-34' })
    expect((await service.list()).map((e) => e.udid).sort()).toEqual(['AB-12', 'CD-34'])
  })

  it('refuses a device id that would leave the snapshots folder', async () => {
    const { service } = setup()
    await expect(service.create({ ...input, udid: '../evil' })).rejects.toThrow('Bad device id')
    await expect(service.list('../evil')).rejects.toThrow('Bad device id')
  })
})
