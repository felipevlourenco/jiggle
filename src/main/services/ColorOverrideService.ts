import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { z } from 'zod'
import { COLOR_FAMILIES, type ColorFamily } from '@shared/layout/color'
import type { ColorOverride, IconColor } from '@shared/types'
import type { Logger } from './bridge/SidecarBridge'

const FILE = 'color-overrides.json'
const Entry = z.object({ name: z.string(), color: z.enum(COLOR_FAMILIES) })

// Colors the person chose for apps, per bundle ID: one small file for every device, which
// Clear Cache leaves alone. What Jiggle read from an icon stays with the icon cache.
export class ColorOverrideService {
  private readonly file: string
  private overrides: Record<string, z.infer<typeof Entry>>

  constructor(
    root: string,
    private readonly log: Logger,
    private readonly onChange: () => void = () => {}
  ) {
    this.file = join(root, FILE)
    this.overrides = this.load()
  }

  list(): ColorOverride[] {
    return Object.entries(this.overrides)
      .map(([bundleId, o]) => ({ bundleId, ...o }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // The icon's color with the person's choice on it. An icon that couldn't be read counts as grey.
  apply(bundleId: string, read: IconColor | null): IconColor | null {
    const mine = this.overrides[bundleId]
    return mine ? { ...(read ?? { h: 0, s: 0, l: 0.5 }), chosen: mine.color } : read
  }

  // null: back to Jiggle's own reading.
  async set(bundleId: string, name: string, color: ColorFamily | null): Promise<void> {
    const next = { ...this.overrides }
    if (color) next[bundleId] = { name, color }
    else delete next[bundleId]
    this.overrides = next
    await writeFileAtomic(this.file, JSON.stringify(next, null, 2))
    this.onChange()
  }

  // Each saved app is kept if its entry is valid, so one bad one doesn't drop the rest.
  private load(): Record<string, z.infer<typeof Entry>> {
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(saved).flatMap(([id, value]) => {
          const entry = Entry.safeParse(value)
          return entry.success ? [[id, entry.data]] : []
        })
      )
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
        this.log.warn('color overrides unreadable, starting empty:', (err as Error).message)
      return {}
    }
  }
}
