import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { AppInfo, AppsResult, InstalledApp } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'

interface CacheEntry {
  storefront: string
  category: string | null // null: the App Store doesn't know this app (TestFlight, enterprise, removed)
  developer: string | null
  fetchedAt: string
}

interface Options {
  root: string
  storefront: () => string // "nl", read each time so a settings change applies at once
  enabled?: () => boolean // false: never touch the network (default true)
  log: Logger
  onChange: () => void // some categories arrived
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const ATTEMPTS = 3
const SAVE_EVERY = 10

// Category and developer per app from Apple's public iTunes Lookup API, one request at a time.
// Cached on disk (including "not on the App Store"). A failed lookup is not cached: it is retried next launch.
export class CategoryService {
  private readonly file: string
  private readonly cache: Record<string, CacheEntry>
  private readonly queue: string[] = []
  private readonly failed = new Set<string>() // gave up this session
  private running = false
  private offline = false
  private readonly doFetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly opts: Options) {
    this.file = join(opts.root, 'category-cache.json')
    this.cache = this.load()
    this.doFetch = opts.fetch ?? fetch
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  // `iconColor` is left null here; the caller adds it.
  // Answers from what is known right now and fetches the rest in the background.
  resolve(apps: InstalledApp[]): AppsResult {
    const infos = apps.map((app): AppInfo => {
      if (app.bundleId.startsWith('com.apple.')) {
        return {
          ...app,
          developer: 'Apple',
          category: 'Apple',
          categorySource: 'apple',
          iconColor: null
        }
      }
      const hit = this.cached(app.bundleId)
      if (!hit) {
        if (
          this.enabled() &&
          !this.failed.has(app.bundleId) &&
          !this.queue.includes(app.bundleId)
        ) {
          this.queue.push(app.bundleId)
        }
        return {
          ...app,
          developer: null,
          category: 'Unknown',
          categorySource: 'unknown',
          iconColor: null
        }
      }
      return {
        ...app,
        developer: hit.developer,
        category: hit.category ?? 'Unknown',
        categorySource: hit.category ? 'appstore' : 'unknown',
        iconColor: null
      }
    })
    if (this.queue.length && !this.running) void this.drain()
    const lookup = this.running ? 'running' : this.offline ? 'offline' : 'idle'
    return { apps: infos, lookup }
  }

  private enabled(): boolean {
    return this.opts.enabled?.() !== false
  }

  // Forget everything fetched so far (Settings > Privacy > Clear Cache).
  async clear(): Promise<void> {
    this.queue.length = 0
    this.failed.clear()
    for (const id of Object.keys(this.cache)) delete this.cache[id]
    await this.save()
  }

  private cached(bundleId: string): CacheEntry | undefined {
    const hit = this.cache[bundleId]
    return hit?.storefront === this.opts.storefront() ? hit : undefined
  }

  private async drain(): Promise<void> {
    this.running = true
    this.offline = false
    let done = 0
    const { log } = this.opts
    log.info(`categories: ${this.queue.length} to look up in "${this.opts.storefront()}"`)
    try {
      for (let id = this.queue.shift(); id; id = this.queue.shift()) {
        if (!this.enabled()) {
          this.queue.length = 0 // switched off while running: no more requests
          break
        }
        const entry = await this.lookup(id)
        if (!entry) {
          this.failed.add(id)
          if (this.offline) {
            // No network: don't spend ~3 s per app finding that out again. Retried next launch.
            this.queue.forEach((rest) => this.failed.add(rest))
            this.queue.length = 0
          }
          continue
        }
        this.offline = false
        this.cache[id] = entry
        if (++done % SAVE_EVERY === 0) {
          await this.save()
          this.opts.onChange()
        }
      }
    } finally {
      this.running = false
      await this.save()
      this.opts.onChange()
    }
  }

  // One request, retried with backoff. null: gave up.
  private async lookup(bundleId: string): Promise<CacheEntry | null> {
    const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${this.opts.storefront()}`
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        this.opts.log.info(`lookup ${bundleId}`)
        const res = await this.doFetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as {
          results?: { primaryGenreName?: string; artistName?: string }[]
        }
        const hit = body.results?.[0]
        return {
          storefront: this.opts.storefront(),
          category: hit?.primaryGenreName ?? null,
          developer: hit?.artistName ?? null,
          fetchedAt: new Date().toISOString()
        }
      } catch (err) {
        this.opts.log.warn(
          `lookup ${bundleId} failed (${attempt}/${ATTEMPTS}):`,
          (err as Error).message
        )
        if (err instanceof TypeError) {
          this.offline = true // fetch itself failed: no network
          this.opts.log.warn(`[lookup-offline] ${bundleId}`)
        }
        if (attempt < ATTEMPTS) await this.sleep(1000 * 2 ** (attempt - 1))
      }
    }
    return null
  }

  private load(): Record<string, CacheEntry> {
    try {
      if (existsSync(this.file)) return JSON.parse(readFileSync(this.file, 'utf8'))
    } catch (err) {
      this.opts.log.warn('category cache unreadable, starting empty:', (err as Error).message)
    }
    return {}
  }

  private save(): Promise<void> {
    return writeFileAtomic(this.file, JSON.stringify(this.cache))
  }
}
