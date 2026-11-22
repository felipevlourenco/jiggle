import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { z } from 'zod'
import { schemas } from '@shared/ipc-contract'
import { gridFor } from '@shared/layout/grid'
import { checkLayoutName, NAME_MAX } from '@shared/layout/names'
import { normalize } from '@shared/layout/normalize'
import { summarize } from '@shared/layout/summarize'
import type { Snapshot, SnapshotEntry, SnapshotSummary, Udid } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'
import { isSafeUdid, snapshotsDir } from './storage/paths'

const AUTO_BACKUPS_KEPT = 50
const FILE = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/ // <ULID>.json

// A saved layout as a file to share (.jiggle). Never holds the device's id.
// Bump FILE_VERSION when the shape changes; older Jiggles refuse a newer file instead of guessing.
export const FILE_VERSION = 1
const MAX_FILE_BYTES = 5_000_000
const LayoutFile = z.object({
  format: z.literal('jiggle-layout'),
  version: z.literal(FILE_VERSION),
  name: z.string(),
  osVersion: z.string(),
  deviceClass: z.enum(['iPhone', 'iPad']).optional(),
  rawState: schemas.RawIconState
})

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
// 26 characters that sort by time: 10 of timestamp, 16 random.
function ulid(time: number): string {
  let stamp = ''
  for (let i = 0; i < 10; i++, time = Math.floor(time / 32)) stamp = CROCKFORD[time % 32]! + stamp
  return stamp + Array.from(randomBytes(16), (b) => CROCKFORD[b % 32]).join('')
}

export type NewSnapshot = Pick<
  Snapshot,
  'udid' | 'kind' | 'name' | 'reason' | 'osVersion' | 'deviceClass' | 'rawState'
>

// Layouts saved to disk as one JSON file each: devices/<udid>/snapshots/<id>.json.
// ponytail: listing reads every file; add an index file if History gets slow with hundreds of snapshots.
export class SnapshotService {
  constructor(
    private readonly root: string,
    private readonly log: Logger,
    private readonly opts: { keepAutoBackups?: () => number; now?: () => number } = {}
  ) {}

  async create(input: NewSnapshot): Promise<SnapshotSummary> {
    const dir = this.dir(input.udid)
    await mkdir(dir, { recursive: true })
    const now = (this.opts.now ?? Date.now)()
    // The same counts the Home Screen info strip shows.
    const layout = normalize(input.rawState, gridFor(input.deviceClass ?? 'iPhone'))
    const snapshot: Snapshot = {
      ...input,
      id: ulid(now),
      createdAt: new Date(now).toISOString(),
      appCount: summarize(layout).apps,
      pageCount: layout.pages.length
    }
    await writeFileAtomic(join(dir, `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2))
    this.log.info(`snapshot ${snapshot.id} saved (${snapshot.kind}, ${snapshot.appCount} apps)`)
    if (snapshot.kind === 'auto-backup') await this.prune(input.udid)
    return summarizeSnapshot(snapshot)
  }

  // A saved layout: the phone's state under a name the person chose. Names are unique per device.
  // Throws a message fit for the name field when the name won't do.
  async saveLayout(
    input: Pick<NewSnapshot, 'udid' | 'osVersion' | 'deviceClass' | 'rawState'> & { name: string }
  ) {
    const name = input.name.trim()
    await this.checkName(input.udid, name)
    return this.create({ ...input, name, kind: 'saved-layout', reason: null })
  }

  async renameLayout(udid: Udid, id: string, name: string): Promise<SnapshotSummary> {
    const saved = await this.getSaved(udid, id)
    const clean = name.trim()
    await this.checkName(udid, clean, id)
    const renamed = { ...saved, name: clean }
    await writeFileAtomic(join(this.dir(udid), `${id}.json`), JSON.stringify(renamed, null, 2))
    return summarizeSnapshot(renamed)
  }

  // Only saved layouts can be deleted by hand; automatic backups are pruned by count.
  async deleteLayout(udid: Udid, id: string): Promise<SnapshotSummary> {
    const saved = await this.getSaved(udid, id)
    await unlink(join(this.dir(udid), `${id}.json`))
    this.log.info(`snapshot ${id} deleted (saved layout “${saved.name}”)`)
    return summarizeSnapshot(saved)
  }

  // The text of a .jiggle file for one saved layout, and a file name for it.
  async exportLayout(udid: Udid, id: string): Promise<{ text: string; fileName: string }> {
    const { name, osVersion, deviceClass, rawState } = await this.getSaved(udid, id)
    const file = {
      format: 'jiggle-layout',
      version: FILE_VERSION,
      name,
      osVersion,
      deviceClass,
      rawState
    }
    const base = (name ?? 'Layout').replace(/[\\/:*?"<>|]/g, '-')
    return { text: JSON.stringify(file, null, 2), fileName: `${base}.jiggle` }
  }

  // Adds a .jiggle file to this device's saved layouts, renamed "Work (2)" if the name is taken.
  // Throws a message for the person when the file is no good.
  async importLayout(udid: Udid, text: string): Promise<SnapshotSummary> {
    if (text.length > MAX_FILE_BYTES) throw new Error('This file is too big to be a Jiggle layout.')
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('This isn’t a Jiggle layout file.')
    }
    const head = z
      .object({ format: z.literal('jiggle-layout'), version: z.number() })
      .safeParse(json)
    if (!head.success) throw new Error('This isn’t a Jiggle layout file.')
    if (head.data.version > FILE_VERSION)
      throw new Error('This layout was made by a newer Jiggle. Update Jiggle to open it.')
    const file = LayoutFile.safeParse(json)
    if (!file.success) throw new Error('This layout file is damaged.')
    const { name, osVersion, deviceClass, rawState } = file.data
    const taken = (await this.readAll(udid))
      .filter((e): e is SnapshotSummary => !e.damaged && e.kind === 'saved-layout')
      .map((e) => e.name ?? '')
    const base = name.trim().slice(0, NAME_MAX - 4) || 'Imported layout'
    let unique = base
    for (let n = 2; checkLayoutName(unique, taken); n++) unique = `${base} (${n})`
    return this.create({
      udid,
      kind: 'saved-layout',
      name: unique,
      reason: null,
      osVersion,
      deviceClass,
      rawState
    })
  }

  // Newest first. A device's snapshots, or every device's when no udid is given.
  async list(udid?: Udid): Promise<SnapshotEntry[]> {
    const udids = udid ? [udid] : await this.devicesWithSnapshots()
    const all = (await Promise.all(udids.map((u) => this.readAll(u)))).flat()
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }

  // One snapshot with its full state, for restoring. Throws if it is missing or damaged.
  async get(udid: Udid, id: string): Promise<Snapshot> {
    if (!FILE.test(`${id}.json`)) throw new Error('No such backup.')
    try {
      return schemas.Snapshot.parse(
        JSON.parse(await readFile(join(this.dir(udid), `${id}.json`), 'utf8'))
      )
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error('No such backup.', { cause: err })
      throw new Error('This backup file is damaged and can’t be restored.', { cause: err })
    }
  }

  // The most recent readable snapshot of a device, or undefined.
  async latest(udid: Udid): Promise<SnapshotSummary | undefined> {
    return (await this.list(udid)).find((e): e is SnapshotSummary => !e.damaged)
  }

  private async getSaved(udid: Udid, id: string): Promise<Snapshot> {
    const snapshot = await this.get(udid, id)
    if (snapshot.kind !== 'saved-layout') throw new Error('Only saved layouts can be changed.')
    return snapshot
  }

  private async checkName(udid: Udid, name: string, exceptId?: string): Promise<void> {
    const taken = (await this.readAll(udid))
      .filter(
        (e): e is SnapshotSummary => !e.damaged && e.kind === 'saved-layout' && e.id !== exceptId
      )
      .map((e) => e.name ?? '')
    const problem = checkLayoutName(name, taken)
    if (problem) throw new Error(problem)
  }

  private dir(udid: Udid): string {
    if (!isSafeUdid(udid)) throw new Error(`Bad device id: ${udid}`)
    return snapshotsDir(this.root, udid)
  }

  private async devicesWithSnapshots(): Promise<Udid[]> {
    try {
      const names = await readdir(join(this.root, 'devices'))
      return names.filter(isSafeUdid)
    } catch {
      return []
    }
  }

  private async readAll(udid: Udid): Promise<SnapshotEntry[]> {
    const dir = this.dir(udid)
    let files: string[]
    try {
      files = (await readdir(dir)).filter((f) => FILE.test(f))
    } catch {
      return [] // no snapshots yet
    }
    return Promise.all(
      files.map(async (file): Promise<SnapshotEntry> => {
        const id = file.slice(0, -'.json'.length)
        try {
          const parsed = schemas.Snapshot.parse(JSON.parse(await readFile(join(dir, file), 'utf8')))
          return summarizeSnapshot(parsed)
        } catch (err) {
          this.log.warn(`snapshot ${file} is damaged:`, (err as Error).message)
          const { mtime } = await stat(join(dir, file))
          return { id, udid, createdAt: mtime.toISOString(), damaged: true }
        }
      })
    )
  }

  // Keep the newest N automatic backups per device. Saved layouts and damaged files are never deleted.
  private async prune(udid: Udid): Promise<void> {
    const keep = this.opts.keepAutoBackups?.() ?? AUTO_BACKUPS_KEPT
    const backups = (await this.readAll(udid)).filter(
      (e): e is SnapshotSummary => !e.damaged && e.kind === 'auto-backup'
    )
    backups.sort((a, b) => b.id.localeCompare(a.id))
    for (const old of backups.slice(keep)) {
      await unlink(join(this.dir(udid), `${old.id}.json`))
      this.log.info(`snapshot ${old.id} deleted (more than ${keep} automatic backups)`)
    }
  }
}

function summarizeSnapshot({ rawState, ...rest }: Snapshot): SnapshotSummary {
  return { ...rest, page1: rawState[1] ?? [], damaged: false }
}
