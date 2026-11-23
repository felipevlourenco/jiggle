import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem } from '../../types'
import { compareLayouts, hasChanges } from '../diff'

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
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})

describe('compareLayouts', () => {
  const before = layout([[app('A'), app('B'), app('C')], [app('D')]], [app('Phone')])

  it('finds nothing between two identical layouts', () => {
    const d = compareLayouts(
      before,
      layout([[app('A'), app('B'), app('C')], [app('D')]], [app('Phone')])
    )
    expect(hasChanges(d)).toBe(false)
    expect(d.moved).toEqual([])
  })

  it('reports apps that changed page and apps that only changed slot', () => {
    const after = layout(
      [
        [app('B'), app('A')],
        [app('C'), app('D')]
      ],
      [app('Phone')]
    )
    const d = compareLayouts(before, after)
    expect(d.moved.map((m) => [m.name, m.from, m.to])).toEqual([
      ['B', 'Page 1, position 2', 'Page 1, position 1'],
      ['A', 'Page 1, position 1', 'Page 1, position 2'],
      ['C', 'Page 1, position 3', 'Page 2, position 1'],
      ['D', 'Page 2, position 1', 'Page 2, position 2']
    ])
    expect(hasChanges(d)).toBe(true)
  })

  it('says which apps joined or left the Home Screen, and the dock counts', () => {
    const after = layout(
      [[app('A'), app('B'), app('E')], [app('D')]],
      [app('Phone'), app('Camera')]
    )
    const d = compareLayouts(before, after)
    expect(d.removed.map((a) => a.name)).toEqual(['C'])
    expect(d.added.map((a) => [a.name, a.at])).toEqual([
      ['Camera', 'Dock, position 2'],
      ['E', 'Page 1, position 3']
    ])
  })

  it('describes a move into a folder', () => {
    const after = layout(
      [[folder('Work', [app('A'), app('B')]), app('C')], [app('D')]],
      [app('Phone')]
    )
    const d = compareLayouts(before, after)
    expect(d.folders).toEqual([{ kind: 'added', name: 'Work' }])
    expect(d.moved.find((m) => m.name === 'B')?.to).toBe("Folder 'Work' · Page 1, position 2")
  })

  it('a renamed folder is one change, not a move for every app inside', () => {
    const a = layout([[folder('Games', [app('X'), app('Y')])]])
    const b = layout([[folder('Fun', [app('X'), app('Y')])]])
    const d = compareLayouts(a, b)
    expect(d.folders).toEqual([{ kind: 'renamed', name: 'Games', to: 'Fun' }])
    expect(d.moved).toEqual([])
  })

  it('reports removed folders and a changed page count', () => {
    const a = layout([[folder('Games', [app('X'), app('Y')])], [app('Z')]])
    const b = layout([[app('X'), app('Y'), app('Z')]])
    const d = compareLayouts(a, b)
    expect(d.folders).toEqual([{ kind: 'removed', name: 'Games' }])
    expect(d.pages).toEqual({ before: 2, after: 1 })
    expect(hasChanges(d)).toBe(true)
  })
})
