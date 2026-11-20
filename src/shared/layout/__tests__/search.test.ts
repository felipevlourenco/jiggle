import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout } from '../../types'
import { findApps } from '../search'

const app = (name: string): AppItem => ({
  kind: 'app',
  id: name,
  bundleId: name,
  name,
  raw: { bundleIdentifier: name, displayName: name }
})
const folder = (name: string, apps: AppItem[]): FolderItem => ({
  kind: 'folder',
  id: `f:${name}`,
  name,
  pages: [apps],
  raw: {}
})
const layout: Layout = {
  grid: { columns: 4, rows: 6, dockMax: 4 },
  dock: [app('Phone'), app('Photos Pro')],
  pages: [
    [app('Maps'), app('Camera')],
    [app('Café'), folder('Travel', [app('Airline'), app('Photo Maps')])],
    [app('Calendar')]
  ]
}

describe('findApps', () => {
  it('finds by part of the name, ignoring case and accents, in page order then the dock', () => {
    expect(findApps(layout, 'ca').map((m) => m.name)).toEqual(['Camera', 'Café', 'Calendar'])
    expect(findApps(layout, 'CAFE').map((m) => m.name)).toEqual(['Café'])
    expect(findApps(layout, 'pho').map((m) => [m.name, m.page])).toEqual([
      ['Photo Maps', 1],
      ['Phone', null],
      ['Photos Pro', null]
    ])
  })

  it('says which folder an app is in', () => {
    expect(findApps(layout, 'airline')).toEqual([
      { id: 'Airline', name: 'Airline', page: 1, folderId: 'f:Travel' }
    ])
  })

  it('an empty search finds nothing', () => {
    expect(findApps(layout, '  ')).toEqual([])
  })
})
