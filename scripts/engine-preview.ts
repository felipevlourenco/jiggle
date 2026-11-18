// Prints a plist layout sorted by the same code the app uses, page by page, like the POC's `homesort.py sort`.
// Usage: pnpm engine:preview <file.plist> [--by name|category] [--widgets keep-pages|sort-around]
// Categories come from the app's cache (open Apps once online), so no network is needed here.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'plist'
import { countMoved } from '../src/shared/layout/diff.ts'
import { normalize } from '../src/shared/layout/normalize.ts'
import { sortLayout, type SortOptions } from '../src/shared/layout/sort.ts'
import type { Layout, LayoutItem, RawIconState } from '../src/shared/types.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string', default: 'name' },
    widgets: { type: 'string', default: 'keep-pages' }
  }
})
const [file] = positionals
const by = values.by as SortOptions['by']
const widgetMode = values.widgets as SortOptions['widgetMode']
if (
  !file ||
  !['name', 'category'].includes(by) ||
  !['keep-pages', 'sort-around'].includes(widgetMode)
) {
  console.error(
    'Usage: pnpm engine:preview <file.plist> [--by name|category] [--widgets keep-pages|sort-around]'
  )
  process.exit(2)
}

const cacheFile = join(homedir(), 'Library/Application Support/Jiggle/category-cache.json')
const cache: Record<string, { category: string | null }> = existsSync(cacheFile)
  ? JSON.parse(readFileSync(cacheFile, 'utf8'))
  : {}
let uncached = 0
const categoryOf = (id: string): string => {
  if (id.startsWith('com.apple.')) return 'Apple'
  if (!cache[id]) uncached++
  return cache[id]?.category ?? 'Unknown'
}

const raw = parse(readFileSync(file, 'utf8')) as unknown as RawIconState
// ponytail: the default iPhone grid; pass the device's own once this script reads a device.
const before = normalize(raw, { columns: 4, rows: 6, dockMax: 4 })
const after = sortLayout(before, { by, widgetMode, categoryOf })

const label = (item: LayoutItem): string =>
  item.kind === 'app' ? item.name : item.kind === 'folder' ? `[${item.name}]` : '<widget/other>'
const lines = (layout: Layout): string[] => [
  `Dock: ${layout.dock.map(label).join(', ')}`,
  ...layout.pages.map((page, i) => `Page ${i + 1}: ${page.map(label).join(', ')}`)
]
console.log(lines(after).join('\n'))
console.log(
  `\n${countMoved(before, after)} items moved, ${before.pages.length} → ${after.pages.length} pages`
)
if (by === 'category' && uncached) {
  console.log(
    `${uncached} apps have no cached category (shown as Unknown): open Jiggle's Apps screen online first.`
  )
}
