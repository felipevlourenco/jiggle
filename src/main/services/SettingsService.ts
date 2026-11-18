import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { channels } from '@shared/ipc-contract'
import type { Settings } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'

const FILE = 'settings.json'

// The person's choices, one small JSON file. Anything missing or invalid falls back to the default.
// ponytail: plain JSON, no electron-store: four values, no migrations yet.
export class SettingsService {
  private current: Settings
  private readonly file: string

  constructor(
    root: string,
    private readonly log: Logger,
    defaultStorefront: string,
    private readonly onChange: (settings: Settings) => void = () => {}
  ) {
    this.file = join(root, FILE)
    const defaults: Settings = {
      theme: 'system',
      storefront: defaultStorefront,
      backupRetention: 50,
      categoryLookupEnabled: true,
      updateCheckEnabled: true
    }
    this.current = { ...defaults, ...this.readValid(defaults) }
  }

  get(): Settings {
    return this.current
  }

  // Validates the patch like any other IPC argument; a bad value changes nothing.
  async set(patch: Partial<Settings>): Promise<Settings> {
    const parsed = channels['settings:set'].args.parse([patch])[0]
    this.current = { ...this.current, ...parsed }
    await writeFileAtomic(this.file, JSON.stringify(this.current, null, 2))
    this.onChange(this.current)
    return this.current
  }

  // Each saved key is kept if it is valid, so one bad value doesn't reset the others.
  private readValid(defaults: Settings): Partial<Settings> {
    let saved: Record<string, unknown>
    try {
      saved = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return {}
    }
    const valid: Record<string, unknown> = {}
    const shape = channels['settings:set'].args.def.items[0]!
    for (const key of Object.keys(defaults)) {
      const one = shape.safeParse({ [key]: saved[key] })
      if (one.success && key in saved) valid[key] = (one.data as Record<string, unknown>)[key]
      else if (key in saved) this.log.warn(`setting "${key}" is invalid, using the default`)
    }
    return valid as Partial<Settings>
  }
}
