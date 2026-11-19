import { describe, expect, it } from 'vitest'
import { appRows, appsToCsv, CSV_COLUMNS, type CsvRow } from '../csv'
import type { AppInfo, Layout } from '../types'

const row = (patch: Partial<CsvRow> = {}): CsvRow => ({
  name: 'Mail',
  bundleId: 'com.apple.mobilemail',
  category: 'Apple',
  developer: 'Apple',
  location: 'Page 1',
  ...patch
})

describe('appsToCsv', () => {
  it('writes the header, then one CRLF-ended line per app, in the column order given', () => {
    expect(appsToCsv([row()], CSV_COLUMNS)).toBe(
      'Name,Bundle ID,Category,Developer,Location\r\nMail,com.apple.mobilemail,Apple,Apple,Page 1\r\n'
    )
    expect(appsToCsv([row()], ['bundleId', 'name'])).toBe(
      'Bundle ID,Name\r\ncom.apple.mobilemail,Mail\r\n'
    )
  })

  it('quotes commas, quotes and line breaks', () => {
    const out = appsToCsv(
      [row({ name: 'Plans, "v2"\nnew', location: "Folder 'A, B' · Page 2" })],
      ['name', 'location']
    )
    expect(out).toBe('Name,Location\r\n"Plans, ""v2""\nnew","Folder \'A, B\' · Page 2"\r\n')
  })

  it('defuses cells a spreadsheet would run as a formula', () => {
    const out = appsToCsv(
      [row({ name: '=HYPERLINK("x")', developer: '@me' })],
      ['name', 'developer']
    )
    expect(out).toContain("'=HYPERLINK")
    expect(out).toContain(",'@me")
  })

  it('keeps accents and empty cells', () => {
    expect(appsToCsv([row({ name: 'Café', developer: '' })], ['name', 'developer'])).toBe(
      'Name,Developer\r\nCafé,\r\n'
    )
  })
})

describe('appRows', () => {
  const app = (id: string, name: string, developer: string | null = null): AppInfo =>
    ({
      bundleId: id,
      name,
      category: 'Unknown',
      developer,
      removable: true,
      categorySource: 'unknown'
    }) as AppInfo
  const raw = (id: string) => ({ kind: 'app' as const, id, bundleId: id, name: id, raw: {} })
  const layout: Layout = {
    dock: [raw('dock.app')],
    pages: [[raw('page.app')]],
    grid: { columns: 4, rows: 6, dockMax: 4 }
  }

  it('says where each app is now, with App Library for one that is on no page', () => {
    const rows = appRows(
      [app('dock.app', 'D'), app('page.app', 'P', 'Dev'), app('lib.app', 'L')],
      layout
    )
    expect(rows.map((r) => r.location)).toEqual(['Dock', 'Page 1', 'App Library'])
    expect(rows[1]!.developer).toBe('Dev')
    expect(rows[0]!.developer).toBe('')
  })
})
