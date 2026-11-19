import { APP_LIBRARY, appLocations } from './layout/locations'
import type { AppInfo, Layout } from './types'

export const CSV_COLUMNS = ['name', 'bundleId', 'category', 'developer', 'location'] as const
export type CsvColumn = (typeof CSV_COLUMNS)[number]
export const CSV_LABELS: Record<CsvColumn, string> = {
  name: 'Name',
  bundleId: 'Bundle ID',
  category: 'Category',
  developer: 'Developer',
  location: 'Location'
}

export type CsvRow = Record<CsvColumn, string>

// One row per installed app, with where it sits now: the same columns as the Apps table.
export function appRows(apps: AppInfo[], layout: Layout): CsvRow[] {
  const where = appLocations(layout)
  return apps.map((a) => ({
    name: a.name,
    bundleId: a.bundleId,
    category: a.category,
    developer: a.developer ?? '',
    location: where.get(a.bundleId)?.location ?? APP_LIBRARY
  }))
}

// A spreadsheet runs a cell that starts with one of these as a formula, and app names come from the App Store.
const FORMULA = /^[=+\-@\t\r]/

function cell(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

// RFC 4180: comma separated, CRLF line ends, quotes doubled. The header uses the labels above.
export function appsToCsv(rows: CsvRow[], columns: readonly CsvColumn[]): string {
  const lines = [
    columns.map((c) => cell(CSV_LABELS[c])),
    ...rows.map((r) => columns.map((c) => cell(r[c])))
  ]
  return lines.map((l) => l.join(',')).join('\r\n') + '\r\n'
}
