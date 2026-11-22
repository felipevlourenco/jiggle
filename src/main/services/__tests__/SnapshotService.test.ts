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

describe('saved layouts', () => {
  const save = (service: SnapshotService, name: string, udid = 'AB-12') =>
    service.saveLayout({ udid, name, osVersion: '26.1', rawState })

  it('saves the exact state under a trimmed name, and lists it as a saved layout', async () => {
    const { service } = setup()
    const made = await save(service, '  Work ')
    expect(made).toMatchObject({ kind: 'saved-layout', name: 'Work', reason: null, appCount: 4 })
    expect((await service.get('AB-12', made.id)).rawState).toEqual(rawState)
    expect((await service.list('AB-12')).map((e) => !e.damaged && e.name)).toEqual(['Work'])
  })

  it('refuses a name that is empty or already used on the device, whatever its case', async () => {
    const { service } = setup()
    await save(service, 'Work')
    await expect(save(service, 'work')).rejects.toThrow('A layout named “work” already exists.')
    await expect(save(service, '   ')).rejects.toThrow('Give the layout a name.')
    expect(await service.list('AB-12')).toHaveLength(1)
    await expect(save(service, 'Work', 'CD-34')).resolves.toBeTruthy() // another device: fine
  })

  it('does not count automatic backups or damaged files as taken names', async () => {
    const { service, dir } = setup()
    await service.create({ ...input, reason: 'Work' })
    writeFileSync(join(dir, '01ARZ3NDEKTSV4RRFFQ69G5FAV.json'), '{ not json')
    await expect(save(service, 'Work')).resolves.toBeTruthy()
  })

  it('renames in place: same id and date, new name, and it sticks after a relaunch', async () => {
    const { root, service } = setup()
    const made = await save(service, 'Work')
    const renamed = await service.renameLayout('AB-12', made.id, ' Office ')
    expect(renamed).toMatchObject({ id: made.id, name: 'Office', createdAt: made.createdAt })
    const reread = await new SnapshotService(root, silent).get('AB-12', made.id)
    expect(reread).toMatchObject({ name: 'Office', rawState })
  })

  it('lets a layout keep its own name when renamed, but not take another’s', async () => {
    const { service } = setup()
    const work = await save(service, 'Work')
    await save(service, 'Weekend')
    await expect(service.renameLayout('AB-12', work.id, 'WORK')).resolves.toMatchObject({
      name: 'WORK'
    })
    await expect(service.renameLayout('AB-12', work.id, 'weekend')).rejects.toThrow(
      'already exists'
    )
  })

  it('deletes a saved layout, and only a saved layout', async () => {
    const { service, dir } = setup()
    const work = await save(service, 'Work')
    const backup = await service.create(input)
    await expect(service.deleteLayout('AB-12', backup.id)).rejects.toThrow('Only saved layouts')
    await expect(service.renameLayout('AB-12', backup.id, 'X')).rejects.toThrow(
      'Only saved layouts'
    )
    await service.deleteLayout('AB-12', work.id)
    expect(readdirSync(dir)).toEqual([`${backup.id}.json`])
    await expect(service.deleteLayout('AB-12', work.id)).rejects.toThrow('No such backup')
    await expect(save(service, 'Work')).resolves.toBeTruthy() // the name is free again
  })
})

describe('layout files', () => {
  const save = (service: SnapshotService, name = 'Work') =>
    service.saveLayout({ udid: 'AB-12', name, osVersion: '26.1', deviceClass: 'iPad', rawState })
  const file = (patch: object) =>
    JSON.stringify({
      format: 'jiggle-layout',
      version: 1,
      name: 'Trip',
      osVersion: '26.1',
      rawState,
      ...patch
    })

  it('exports a saved layout to a file that imports on another device, state unchanged, without the device id', async () => {
    const { service } = setup()
    const made = await save(service)
    const { text, fileName } = await service.exportLayout('AB-12', made.id)
    expect(fileName).toBe('Work.jiggle')
    expect(text).not.toContain('AB-12')
    const other = setup().service // "another Mac"
    const imported = await other.importLayout('CD-34', text)
    expect(imported).toMatchObject({
      kind: 'saved-layout',
      name: 'Work',
      deviceClass: 'iPad',
      appCount: 4
    })
    expect((await other.get('CD-34', imported.id)).rawState).toEqual(rawState)
  })

  it('only exports saved layouts, and cleans the file name', async () => {
    const { service } = setup()
    const backup = await service.create(input)
    await expect(service.exportLayout('AB-12', backup.id)).rejects.toThrow('Only saved layouts')
    const odd = await save(service, 'a/b: c')
    expect((await service.exportLayout('AB-12', odd.id)).fileName).toBe('a-b- c.jiggle')
  })

  it('renames an imported layout whose name is taken, within the name limit', async () => {
    const { service } = setup()
    await save(service, 'Trip')
    expect((await service.importLayout('AB-12', file({}))).name).toBe('Trip (2)')
    expect((await service.importLayout('AB-12', file({}))).name).toBe('Trip (3)')
    const long = await service.importLayout('AB-12', file({ name: 'x'.repeat(100) }))
    expect(long.name!.length).toBeLessThanOrEqual(40)
    expect((await service.importLayout('AB-12', file({ name: '  ' }))).name).toBe('Imported layout')
  })

  it('refuses a file that is not JSON, not ours, newer, or damaged, and adds nothing', async () => {
    const { service } = setup()
    await expect(service.importLayout('AB-12', 'nope')).rejects.toThrow(
      'isn’t a Jiggle layout file'
    )
    await expect(service.importLayout('AB-12', '{"a":1}')).rejects.toThrow(
      'isn’t a Jiggle layout file'
    )
    await expect(service.importLayout('AB-12', file({ version: 2 }))).rejects.toThrow(
      'newer Jiggle'
    )
    await expect(service.importLayout('AB-12', file({ rawState: 'x' }))).rejects.toThrow('damaged')
    await expect(service.importLayout('AB-12', 'x'.repeat(5_000_001))).rejects.toThrow('too big')
    expect(await service.list('AB-12')).toEqual([])
  })
})
