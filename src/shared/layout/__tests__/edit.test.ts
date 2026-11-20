import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, WidgetItem } from '../../types'
import {
  commit,
  compact,
  locate,
  makeFolder,
  moveItem,
  redo,
  renameFolder,
  startDraft,
  undo
} from '../edit'
import { gridFor } from '../grid'
import { validateLayout } from '../validate'

const app = (id: string): AppItem => ({ kind: 'app', id, bundleId: id, name: id, raw: { id } })
const folder = (id: string, apps: AppItem[][]): FolderItem => ({
  kind: 'folder',
  id,
  name: id,
  pages: apps,
  raw: {}
})
const widget: WidgetItem = { kind: 'widget', id: 'w', raw: { gridSize: 'medium' } }
const ids = (items: { id: string }[]): string[] => items.map((i) => i.id)
const layout = (over: Partial<Layout> = {}): Layout => ({
  dock: [app('d1'), app('d2')],
  pages: [[app('a'), app('b'), app('c'), app('d')], [app('e'), app('f')], []],
  grid: gridFor('iPhone'),
  ...over
})

describe('moveItem', () => {
  it('moves within a page: the item takes the target slot', () => {
    const l = moveItem(layout(), 'a', { zone: 'page', page: 0, index: 2 })!
    expect(ids(l.pages[0]!)).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(moveItem(layout(), 'd', { zone: 'page', page: 0, index: 1 })!.pages[0]!)).toEqual([
      'a',
      'd',
      'b',
      'c'
    ])
  })

  it('moves across pages, into an empty page, and to the end of a page', () => {
    const l = moveItem(layout(), 'f', { zone: 'page', page: 0, index: 0 })!
    expect(ids(l.pages[0]!)).toEqual(['f', 'a', 'b', 'c', 'd'])
    expect(ids(l.pages[1]!)).toEqual(['e'])
    expect(ids(moveItem(layout(), 'a', { zone: 'page', page: 2, index: 0 })!.pages[2]!)).toEqual([
      'a'
    ])
    // index past the end means "last"
    expect(ids(moveItem(layout(), 'a', { zone: 'page', page: 0, index: 99 })!.pages[0]!)).toEqual([
      'b',
      'c',
      'd',
      'a'
    ])
  })

  it('returns the same layout when nothing changes, and never mutates the input', () => {
    const l = layout()
    expect(moveItem(l, 'b', { zone: 'page', page: 0, index: 1 })).toBe(l)
    expect(moveItem(l, 'd2', { zone: 'dock', index: 1 })).toBe(l)
    moveItem(l, 'a', { zone: 'page', page: 1, index: 0 })
    expect(ids(l.pages[0]!)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('refuses a full page, a full dock and an unknown item', () => {
    const full = layout({
      pages: [Array.from({ length: 24 }, (_, i) => app(`x${i}`)), [app('e')]]
    })
    expect(moveItem(full, 'e', { zone: 'page', page: 0, index: 0 })).toBeNull()
    const dock = layout({ dock: ['1', '2', '3', '4'].map(app) })
    expect(moveItem(dock, 'a', { zone: 'dock', index: 0 })).toBeNull()
    expect(moveItem(layout(), 'nope', { zone: 'page', page: 0, index: 0 })).toBeNull()
    expect(moveItem(layout(), 'a', { zone: 'page', page: 9, index: 0 })).toBeNull()
  })

  it('counts a widget as the cells it covers', () => {
    // a medium widget is 8 cells: 16 apps fill the other 16
    const l = layout({
      pages: [[widget, ...Array.from({ length: 16 }, (_, i) => app(`x${i}`))], [app('e')]]
    })
    expect(moveItem(l, 'e', { zone: 'page', page: 0, index: 1 })).toBeNull()
    const roomy = layout({ pages: [[widget, app('x')], [app('e')]] })
    expect(moveItem(roomy, 'e', { zone: 'page', page: 0, index: 1 })).not.toBeNull()
  })

  it('moves to and within the dock', () => {
    const l = moveItem(layout(), 'a', { zone: 'dock', index: 0 })!
    expect(ids(l.dock)).toEqual(['a', 'd1', 'd2'])
    expect(ids(moveItem(layout(), 'd1', { zone: 'page', page: 1, index: 0 })!.dock)).toEqual(['d2'])
  })

  it('puts an app into a folder, and refuses a full folder or a folder in a folder', () => {
    const l = layout({ pages: [[app('a'), folder('F', [[app('x')]]), app('b')], []] })
    const moved = moveItem(l, 'a', { zone: 'folder', folderId: 'F' })!
    const f = moved.pages[0]!.find((i) => i.id === 'F') as FolderItem
    expect(ids(f.pages[0]!)).toEqual(['x', 'a'])
    expect(ids(moved.pages[0]!)).toEqual(['F', 'b'])
    expect(moveItem(l, 'F', { zone: 'folder', folderId: 'F' })).toBeNull()

    const full = layout({
      pages: [[app('a'), folder('F', [Array.from({ length: 9 }, (_, i) => app(`x${i}`))])], []]
    })
    expect(moveItem(full, 'a', { zone: 'folder', folderId: 'F' })).toBeNull()

    const two = layout({
      pages: [[folder('F', [[app('x')]]), folder('G', [[app('y')]])], []]
    })
    expect(moveItem(two, 'F', { zone: 'folder', folderId: 'G' })).toBeNull()
  })

  it('takes an app out of a folder, and removes a folder that ends up empty', () => {
    const l = layout({ pages: [[folder('F', [[app('x'), app('y')]]), app('a')], []] })
    const out = moveItem(l, 'x', { zone: 'page', page: 0, index: 0 })!
    expect(ids(out.pages[0]!)).toEqual(['x', 'F', 'a'])
    expect(ids((out.pages[0]![1] as FolderItem).pages[0]!)).toEqual(['y'])

    const lone = layout({ pages: [[folder('F', [[app('x')]]), app('a')], []] })
    const gone = moveItem(lone, 'x', { zone: 'page', page: 0, index: 1 })!
    expect(ids(gone.pages[0]!)).toEqual(['a', 'x'])
  })

  it('moves an app from one folder to another', () => {
    const l = layout({
      pages: [[folder('F', [[app('x'), app('y')]]), folder('G', [[app('z')]])], []]
    })
    const m = moveItem(l, 'x', { zone: 'folder', folderId: 'G' })!
    expect(ids((m.pages[0]![0] as FolderItem).pages[0]!)).toEqual(['y'])
    expect(ids((m.pages[0]![1] as FolderItem).pages[0]!)).toEqual(['z', 'x'])
  })

  it('keeps every app exactly once, so the result passes validation', () => {
    const l = layout({
      pages: [[app('a'), folder('F', [[app('x'), app('y')]]), widget], [app('e')]]
    })
    let next = l
    for (const [id, target] of [
      ['x', { zone: 'page', page: 1, index: 0 }],
      ['a', { zone: 'folder', folderId: 'F' }],
      ['e', { zone: 'dock', index: 0 }],
      ['y', { zone: 'page', page: 0, index: 0 }]
    ] as const) {
      next = moveItem(next, id, target) ?? next
    }
    expect(validateLayout(l, compact(next))).toEqual([])
  })
})

describe('locate', () => {
  it('finds items in the dock, on pages and inside folders', () => {
    const l = layout({ pages: [[folder('F', [[app('x')]])], []] })
    expect(locate(l, 'd2')).toEqual({ zone: 'dock', index: 1 })
    expect(locate(l, 'F')).toEqual({ zone: 'page', page: 0, index: 0 })
    expect(locate(l, 'x')).toEqual({ zone: 'folder', folderId: 'F', folderPage: 0, index: 0 })
    expect(locate(l, 'nope')).toBeNull()
  })
})

describe('draft history', () => {
  it('undoes and redoes step by step, and a new change drops the redo steps', () => {
    const l0 = layout()
    const l1 = moveItem(l0, 'a', { zone: 'page', page: 1, index: 0 })!
    const l2 = moveItem(l1, 'b', { zone: 'page', page: 1, index: 0 })!
    let d = commit(commit(startDraft(l0), l1), l2)
    expect(d.past).toHaveLength(2)
    d = undo(undo(d))
    expect(d.present).toBe(l0)
    expect(undo(d)).toBe(d)
    d = redo(d)
    expect(d.present).toBe(l1)
    const l3 = moveItem(l1, 'c', { zone: 'dock', index: 0 })!
    d = commit(d, l3)
    expect(d.future).toEqual([])
    expect(redo(d)).toBe(d)
  })

  it('ignores a no-op commit', () => {
    const d = startDraft(layout())
    expect(commit(d, d.present)).toBe(d)
  })
})

describe('compact', () => {
  it('drops empty pages only', () => {
    expect(compact(layout()).pages).toHaveLength(2)
  })
})

describe('folder editing', () => {
  const withFolder = (): Layout =>
    layout({
      pages: [[app('a'), folder('F', [[app('x'), app('y'), app('z')]]), app('b')], []]
    })
  const inside = (l: Layout): string[] => ids((l.pages[0]![1] as FolderItem).pages.flat())

  it('renames a folder, in its name and in the raw dict the phone reads', () => {
    const l = renameFolder(withFolder(), 'F', '  Travel ')!
    const f = l.pages[0]![1] as FolderItem
    expect(f.name).toBe('Travel')
    expect(f.raw['displayName']).toBe('Travel')
    expect(renameFolder(withFolder(), 'F', '   ')).toBeNull()
    expect(renameFolder(withFolder(), 'nope', 'x')).toBeNull()
    const same = withFolder()
    expect(renameFolder(same, 'F', 'F')).toBe(same)
  })

  it('reorders apps inside a folder, and repages it nine to a page', () => {
    expect(
      inside(moveItem(withFolder(), 'x', { zone: 'folder', folderId: 'F', index: 2 })!)
    ).toEqual(['y', 'z', 'x'])
    expect(
      inside(moveItem(withFolder(), 'z', { zone: 'folder', folderId: 'F', index: 0 })!)
    ).toEqual(['z', 'x', 'y'])
    const l = withFolder()
    expect(moveItem(l, 'x', { zone: 'folder', folderId: 'F', index: 0 })).toBe(l)
    // an app from outside can't be slotted in, only added at the end
    expect(moveItem(l, 'a', { zone: 'folder', folderId: 'F', index: 0 })).toBeNull()
    const ten = layout({
      pages: [[folder('F', [Array.from({ length: 9 }, (_, i) => app(`k${i}`)), [app('m')]])], []]
    })
    const moved = moveItem(ten, 'm', { zone: 'folder', folderId: 'F', index: 0 })!
    const pages = (moved.pages[0]![0] as FolderItem).pages
    expect(pages.map((p) => p.length)).toEqual([9, 1])
    expect(ids(pages[0]!)[0]).toBe('m')
  })

  it('dropping an app on another app makes a folder in the target’s place', () => {
    const l = makeFolder(layout(), 'a', 'c')!
    const f = l.pages[0]!.find((i) => i.kind === 'folder') as FolderItem
    expect(f.name).toBe('New Folder')
    expect(ids(f.pages[0]!)).toEqual(['c', 'a'])
    expect(ids(l.pages[0]!)).toEqual(['b', 'folder:new-a', 'd'])
    expect(l.pages[0]!.some((i) => i.id === 'a')).toBe(false)
  })

  it('makeFolder works from another page and the dock, and refuses non-apps and apps in folders', () => {
    const l = makeFolder(layout(), 'e', 'd1')!
    expect(ids(l.dock)).toEqual(['folder:new-e', 'd2'])
    expect(ids(l.pages[1]!)).toEqual(['f'])
    const wf = withFolder()
    expect(makeFolder(wf, 'a', 'F')).toBeNull() // onto a folder: that's a move into it
    expect(makeFolder(wf, 'a', 'x')).toBeNull() // onto an app inside a folder
    expect(makeFolder(wf, 'a', 'a')).toBeNull()
    expect(makeFolder(layout({ pages: [[app('a'), widget], []] }), 'a', 'w')).toBeNull()
  })
})
