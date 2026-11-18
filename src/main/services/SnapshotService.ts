import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { schemas } from '@shared/ipc-contract'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { summarize } from '@shared/layout/summarize'
import type { Snapshot, SnapshotEntry, SnapshotSummary, Udid } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'
import { isSafeUdid, snapshotsDir } from './storage/paths'

const AUTO_BACKUPS_KEPT = 50
const FILE = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/ // <ULID>.json

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
// 26 characters that sort by time: 10 of timestamp, 16 random.
function ulid(time: number): string {
  let stamp = ''
  for (let i = 0; i < 10; i++, time = Math.floor(time / 32)) stamp = CROCKFORD[time % 32]! + stamp
  return stamp + Array.from(randomBytes(16), (b) => CROCKFORD[b % 32]).join('')
}

export type NewSnapshot = Pick<
  Snapshot,
  'udid' | 'kind' | 'name' | 'reason' | 'osVersion' | 'rawState'
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
    const layout = normalize(input.rawState, gridFor('iPhone'))
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
