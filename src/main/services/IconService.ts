import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { IconColor, Udid } from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import { iconColorsPath, iconsDir, isSafeBundleId, isSafeUdid } from './storage/paths'

const BATCH = 20

// Turns a PNG into its dominant color. Electron's nativeImage in the app, a stub in tests.
export type ColorOf = (png: Buffer) => IconColor | null

// Keeps a disk cache of each device's app icons and their colors, so the UI never waits on the phone twice.
// ponytail: an icon is cached forever; an updated app icon needs the cache cleared (key by iconModDate if it matters).
export class IconService {
  // The latest run per device: a new call waits for it, then fetches only what is still missing.
  private tail = new Map<Udid, Promise<void>>()

  constructor(
    private readonly bridge: DeviceBridge,
    private readonly root: string,
    private readonly log: Logger,
    private readonly colorOf?: ColorOf
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
    await this.syncColors(udid, ids)
  }

  // Delete every device's cached icons and colors; they are fetched again when needed.
  async clear(): Promise<void> {
    const udids = await readdir(join(this.root, 'devices')).catch(() => [] as string[])
    for (const udid of udids.filter(isSafeUdid)) {
      await rm(iconsDir(this.root, udid), { recursive: true, force: true })
      await rm(iconColorsPath(this.root, udid), { force: true })
    }
    this.log.info('icon cache cleared')
  }

  // bundle id -> dominant color (null: the icon couldn't be read). Empty until the icons are synced.
  async colors(udid: Udid): Promise<Record<string, IconColor | null>> {
    try {
      return JSON.parse(await readFile(iconColorsPath(this.root, udid), 'utf8'))
    } catch {
      return {}
    }
  }

  // Read each icon's color once; after that it is a lookup.
  private async syncColors(udid: Udid, ids: string[]): Promise<void> {
    if (!this.colorOf) return
    const known = await this.colors(udid)
    const todo = ids.filter(
      (id) => !(id in known) && existsSync(join(iconsDir(this.root, udid), `${id}.png`))
    )
    if (todo.length === 0) return
    for (const id of todo) {
      try {
        known[id] = this.colorOf(await readFile(join(iconsDir(this.root, udid), `${id}.png`)))
      } catch (err) {
        this.log.warn(`icon color ${id} failed:`, (err as Error).message)
        known[id] = null
      }
    }
    await writeFileAtomic(iconColorsPath(this.root, udid), JSON.stringify(known))
    this.log.info(`icons: read ${todo.length} colors`)
  }
}
