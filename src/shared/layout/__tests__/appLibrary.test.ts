import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem } from '../../types'
import { sendToAppLibrary } from '../appLibrary'
import { validateLayout } from '../validate'

const app = (id: string): AppItem => ({
  kind: 'app',
  id,
  bundleId: id,
  name: id,
  raw: { bundleIdentifier: id, displayName: id }
})
const folder = (id: string, ...apps: AppItem[]): FolderItem => ({
  kind: 'folder',
  id,
  name: id,
  pages: [apps],
  raw: { listType: 'folder', displayName: id }
})
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const ids = (page: LayoutItem[] | undefined): string[] => (page ?? []).map((i) => i.id)

describe('sendToAppLibrary', () => {
  const before = layout(
    [[app('a'), app('b'), app('c')], [folder('f', app('d'), app('e'))], [folder('g', app('h'))]],
    [app('phone')]
  )

  it('removes loose apps and apps inside folders, and validate accepts it with the removal listed', () => {
    const out = sendToAppLibrary(before, new Set(['a', 'd']))
    expect(ids(out.pages[0])).toEqual(['b', 'c'])
    expect((out.pages[1]![0] as FolderItem).pages.flat().map((a) => a.id)).toEqual(['e'])
    expect(validateLayout(before, out, ['a', 'd'])).toEqual([])
    expect(validateLayout(before, out).map((i) => i.code)).toEqual(['missing-app', 'missing-app'])
  })

  it('drops a folder, and then a page, that ends up empty', () => {
    const out = sendToAppLibrary(before, new Set(['h']))
    expect(out.pages).toHaveLength(2)
  })

  it('leaves the dock and everything else as it was', () => {
    const out = sendToAppLibrary(before, new Set(['phone', 'zzz']))
    expect(out.dock).toBe(before.dock)
    expect(out.pages).toEqual(before.pages)
    expect(out.pages[1]![0]).toBe(before.pages[1]![0])
  })
})
