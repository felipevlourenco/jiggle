import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem } from '../../types'
import { serialize } from '../serialize'
import { sortLayout } from '../sort'
import { validateLayout } from '../validate'

const app = (name: string): AppItem => ({
  kind: 'app',
  id: name,
  bundleId: name,
  name,
  raw: { bundleIdentifier: name, displayName: name }
})
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const category = (id: string): string =>
  ({ A1: 'Social', A2: 'Social', A3: 'Social', S1: 'Games', U1: 'Unknown', U2: 'Unknown' })[id] ??
  'Games'
const opts = {
  by: 'category',
  widgetMode: 'keep-pages',
  categoryOf: category,
  folders: true
} as const
const label = (i: LayoutItem): string => ('name' in i ? i.name : '?')

describe('auto-folders', () => {
  const before = layout([
    [app('A1'), app('S1'), app('A2')],
    [app('U1'), app('A3'), app('U2')]
  ])

  it('makes a folder for a category with 2+ apps; a lone app and Unknown stay loose', () => {
    const out = sortLayout(before, opts)
    expect(out.pages.flat().map(label)).toEqual(['Social', 'S1', 'U1', 'U2'])
    const social = out.pages[0]![0] as FolderItem
    expect(social.pages.flat().map(label)).toEqual(['A1', 'A2', 'A3'])
  })

  it('apps and folders are all kept, so the layout validates', () => {
    expect(validateLayout(before, sortLayout(before, opts))).toEqual([])
  })

  it('the new folder serializes like the phone writes its own', () => {
    const raw = serialize(sortLayout(before, opts))
    expect(raw[1]![0]).toMatchObject({
      displayName: 'Social',
      listType: 'folder',
      iconLists: [
        [{ bundleIdentifier: 'A1' }, { bundleIdentifier: 'A2' }, { bundleIdentifier: 'A3' }]
      ]
    })
  })

  it('leaves existing folders alone, even one named like a category', () => {
    const mine: FolderItem = {
      kind: 'folder',
      id: 'mine',
      name: 'Social',
      pages: [[app('A9')]],
      raw: { displayName: 'Social', iconLists: [[{ bundleIdentifier: 'A9' }]], listType: 'folder' }
    }
    const out = sortLayout(layout([[mine, app('A1'), app('A2')]]), opts)
    expect(out.pages[0]!.filter((i) => i.kind === 'folder').length).toBe(2)
    expect(out.pages[0]).toContain(mine)
  })

  it('splits a category of more than 9 apps over several folder pages', () => {
    const many = Array.from({ length: 12 }, (_, i) => app(`G${i}`))
    const out = sortLayout(layout([many]), opts)
    expect((out.pages[0]![0] as FolderItem).pages.map((p) => p.length)).toEqual([9, 3])
  })

  it('does nothing unless sorting by category with the option on', () => {
    expect(
      sortLayout(before, { ...opts, folders: false })
        .pages.flat()
        .every((i) => i.kind === 'app')
    ).toBe(true)
    expect(
      sortLayout(before, { ...opts, by: 'name' })
        .pages.flat()
        .every((i) => i.kind === 'app')
    ).toBe(true)
  })

  it('does not fold a pinned app, and pinned pages stay as they are', () => {
    const page1 = [app('A1'), app('A2')]
    const out = sortLayout(layout([page1, [app('S1'), app('G1'), app('A3'), app('A9')]]), {
      ...opts,
      pins: { apps: ['A9'], page1: true }
    })
    expect(out.pages[0]).toBe(page1)
    expect(out.pages[1]!.map(label)).toEqual(['Games', 'A3', 'A9'])
  })

  it('drops pages the folding emptied', () => {
    const out = sortLayout(layout([[app('A1'), app('A2')], [app('A3'), app('S1')], [app('U1')]]), {
      ...opts,
      pins: { apps: ['U1'], page1: false }
    })
    expect(out.pages.map((p) => p.map(label))).toEqual([['Social', 'S1'], ['U1']])
  })
})
