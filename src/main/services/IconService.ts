import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { Udid } from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import { iconsDir, isSafeBundleId, wallpaperPath } from './storage/paths'

const BATCH = 20
// The wallpaper is big and changes rarely: re-read it at most once a day.
const WALLPAPER_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Keeps a disk cache of each device's app icons and wallpaper, so the UI never waits on the phone twice.
// ponytail: an icon is cached forever; an updated app icon needs the cache cleared (key by iconModDate if it matters).
export class IconService {
  private inFlight = new Map<Udid, Promise<{ hasWallpaper: boolean }>>()

  constructor(
    private readonly bridge: DeviceBridge,
    private readonly root: string,
    private readonly log: Logger
  ) {}

  // Make sure every icon (and the wallpaper) is on disk. Concurrent calls for a device share one run.
  sync(udid: Udid, bundleIds: string[]): Promise<{ hasWallpaper: boolean }> {
    let run = this.inFlight.get(udid)
    if (!run) {
      run = this.run(udid, bundleIds).finally(() => this.inFlight.delete(udid))
      this.inFlight.set(udid, run)
    }
    return run
  }

  private async run(udid: Udid, bundleIds: string[]): Promise<{ hasWallpaper: boolean }> {
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

    return { hasWallpaper: await this.syncWallpaper(udid) }
  }

  private async syncWallpaper(udid: Udid): Promise<boolean> {
    const file = wallpaperPath(this.root, udid)
    const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < WALLPAPER_MAX_AGE_MS
    if (fresh) return true
    try {
      const png = await this.bridge.getWallpaper(udid)
      if (png) await writeFileAtomic(file, png)
      else this.log.info('wallpaper unavailable: using the gradient fallback')
    } catch (err) {
      this.log.warn('wallpaper failed:', (err as Error).message)
    }
    return existsSync(file) // an older copy is still better than none
  }
}
