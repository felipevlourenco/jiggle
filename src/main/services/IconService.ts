import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { Udid } from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import { iconsDir, isSafeBundleId } from './storage/paths'

const BATCH = 20

// Keeps a disk cache of each device's app icons, so the UI never waits on the phone twice.
// ponytail: an icon is cached forever; an updated app icon needs the cache cleared (key by iconModDate if it matters).
export class IconService {
  // The latest run per device: a new call waits for it, then fetches only what is still missing.
  private tail = new Map<Udid, Promise<void>>()

  constructor(
    private readonly bridge: DeviceBridge,
    private readonly root: string,
    private readonly log: Logger
  ) {}

  // Make sure every icon is on disk. Calls for one device run one after another.
  sync(udid: Udid, bundleIds: string[]): Promise<void> {
    const run = (this.tail.get(udid) ?? Promise.resolve()).then(() => this.run(udid, bundleIds))
    const tail = run.catch(() => {})
    this.tail.set(udid, tail)
    void tail.then(() => {
      if (this.tail.get(udid) === tail) this.tail.delete(udid)
    })
    return run
  }

  private async run(udid: Udid, bundleIds: string[]): Promise<void> {
    const dir = iconsDir(this.root, udid)
    await mkdir(dir, { recursive: true })

    const ids = [...new Set(bundleIds)].filter(isSafeBundleId)
    const missing = ids.filter((id) => !existsSync(join(dir, `${id}.png`)))
    this.log.info(`icons: ${ids.length - missing.length} cached, ${missing.length} to fetch`)

    let fetched = 0
    for (let i = 0; i < missing.length; i += BATCH) {
      const icons = await this.bridge.getIcons(udid, missing.slice(i, i + BATCH))
      for (const [id, png] of icons) {
        if (!isSafeBundleId(id)) continue
        await writeFileAtomic(join(dir, `${id}.png`), png)
        fetched++
      }
    }
    if (missing.length) this.log.info(`icons: fetched ${fetched} of ${missing.length}`)
  }
}
