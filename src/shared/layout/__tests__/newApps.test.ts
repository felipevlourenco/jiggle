import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem } from '../../types'
import { applyCleanup, findCleanup } from '../cleanup'
import { findNewApps, type NewApps } from '../newApps'
import { validateLayout } from '../validate'

const app = (id: string): AppItem => ({
  kind: 'app',
  id,
  bundleId: id,
  name: id,
  raw: { bundleIdentifier: id }
})
const folder = (id: string, name: string, ...ids: string[]): FolderItem => ({
  kind: 'folder',
  id,
  name,
  pages: [ids.map(app)],
  raw: { listType: 'folder' }
})
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const newApps = (
  ids: string[],
  categories: Record<string, string> = {},
  developers: Record<string, string> = {}
): NewApps => ({
  ids: new Set(ids),
  categoryOf: (id) => categories[id] ?? 'Unknown',
  developerOf: (id) => developers[id] ?? null
})
const moves = (l: Layout, n: NewApps): [string, string][] =>
  findNewApps(l, n).map((i) => [i.app.id, i.folderName])
const inFolder = (l: Layout, id: string): string[] =>
  [...l.dock, ...l.pages.flat()].flatMap((i) =>
    i.kind === 'folder' && i.id === id ? i.pages.flat().map((a) => a.id) : []
  )

describe('findNewApps', () => {
  const phone = layout([[folder('g', 'Games', 'a', 'b'), folder('go', 'Google LLC', 'c', 'd')]])
  const withNew = (...ids: string[]): Layout => ({
    ...phone,
    pages: [...phone.pages, ids.map(app)]
  })

  it('offers the folder named after the category, ignoring case and accents', () => {
    const l = layout([[folder('f', 'gámes', 'a', 'b'), app('chess')]])
    expect(moves(l, newApps(['chess'], { chess: 'Games' }))).toEqual([['chess', 'gámes']])
  })

  it('offers the developer’s folder when no folder matches the category', () => {
    const n = newApps(['maps'], { maps: 'Navigation' }, { maps: 'Google LLC' })
    expect(moves(withNew('maps'), n)).toEqual([['maps', 'Google LLC']])
  })

  it('prefers the category, and falls back to the developer when that folder is full', () => {
    const n = newApps(['x'], { x: 'Games' }, { x: 'Google LLC' })
    expect(moves(withNew('x'), n)).toEqual([['x', 'Games']])
    const nine = folder('g', 'Games', ...'123456789')
    const full = layout([[nine, folder('go', 'Google LLC', 'c', 'd'), app('x')]])
    expect(moves(full, n)).toEqual([['x', 'Google LLC']])
  })

  it('leaves an app with no matching folder where it is, whatever "Unknown" folder there is', () => {
    const l = layout([[folder('u', 'Unknown', 'a', 'b'), app('x'), app('y')]])
    expect(moves(l, newApps(['x', 'y'], { y: 'Weather' }))).toEqual([])
  })

  it('only looks at new apps lying loose on a page', () => {
    const l = layout([[folder('g', 'Games', 'filed', 'b'), app('old')]], [app('docked')])
    const all = { old: 'Games', docked: 'Games', filed: 'Games' }
    expect(moves(l, newApps(['docked', 'filed'], all))).toEqual([])
  })

  it('does not promise the last free slot of a folder twice', () => {
    const eight = layout([[folder('g', 'Games', ...'12345678'), app('x'), app('y')]])
    const n = newApps(['x', 'y'], { x: 'Games', y: 'Games' })
    expect(moves(eight, n)).toEqual([['x', 'Games']])
  })

  it('can use a folder in the dock', () => {
    const l = layout([[app('x')]], [folder('d', 'Games', 'a', 'b')])
    expect(moves(l, newApps(['x'], { x: 'Games' }))).toEqual([['x', 'Games']])
  })
})

describe('cleanup with new apps', () => {
  // page 1: a one-app folder that a new app is about to join; page 2 holds only that app; page 3 is empty
  const before = layout([
    [folder('g', 'Games', 'a'), folder('one', 'Other', 'z'), app('keep')],
    [app('chess')],
    []
  ])
  const n = newApps(['chess'], { chess: 'Games' })

  it('lists them in page order, and does not call the folder they join a one-app folder', () => {
    expect(findCleanup(before, n).map((i) => i.id)).toEqual(['folder:one', 'new:chess', 'page:2'])
  })

  it('without the new apps, the same layout lists both one-app folders', () => {
    expect(findCleanup(before).map((i) => i.id)).toEqual(['folder:g', 'folder:one', 'page:2'])
  })

  it('moves only that app, drops the page the move emptied, and keeps every app', () => {
    const move = findCleanup(before, n).filter((i) => i.kind === 'new-app')
    const after = applyCleanup(before, move)
    expect(inFolder(after, 'g')).toEqual(['a', 'chess'])
    expect(after.pages.map((p) => p.map((i) => i.id))).toEqual([['g', 'one', 'keep'], []])
    expect(validateLayout(before, after)).toEqual([])
  })

  it('fixes everything at once without losing an app', () => {
    const after = applyCleanup(before, findCleanup(before, n))
    expect(after.pages.map((p) => p.map((i) => i.id))).toEqual([['g', 'z', 'keep']])
    expect(validateLayout(before, after)).toEqual([])
  })
})
