import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem, RawIconState } from '../../types'
import { applyCleanup, findCleanup } from '../cleanup'
import { gridFor } from '../grid'
import { normalize } from '../normalize'
import { validateLayout } from '../validate'

const app = (id: string): AppItem => ({
  kind: 'app',
  id,
  bundleId: id,
  name: id,
  raw: { bundleIdentifier: id }
})
const folder = (id: string, ...pages: AppItem[][]): FolderItem => ({
  kind: 'folder',
  id,
  name: `F ${id}`,
  pages,
  raw: { listType: 'folder' }
})
const layout = (pages: LayoutItem[][]): Layout => ({
  dock: [],
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const ids = (l: Layout): string[][] => l.pages.map((p) => p.map((i) => i.id))

describe('findCleanup', () => {
  const messy = layout([
    [app('a'), folder('one', [app('b')]), app('c')],
    [],
    [folder('two', [app('d')], []), folder('many', [app('e'), app('f')])],
    [folder('split', [app('g')], [app('h')])],
    []
  ])

  it('lists empty pages and one-app folders in page order', () => {
    expect(findCleanup(messy).map((i) => [i.id, i.page])).toEqual([
      ['folder:one', 0],
      ['page:1', 1],
      ['folder:two', 2],
      ['page:4', 4]
    ])
  })

  it('names the folder and the app inside it', () => {
    const [first] = findCleanup(messy)
    expect(first).toMatchObject({ kind: 'one-app-folder', name: 'F one', app: { id: 'b' } })
  })

  it('leaves folders with two apps (even on two folder pages), empty folders and the dock alone', () => {
    const l = {
      ...layout([[folder('split', [app('g')], [app('h')]), folder('none')]]),
      dock: [folder('d', [app('x')])]
    }
    expect(findCleanup(l)).toEqual([])
  })

  it('finds nothing on a tidy layout', () => {
    expect(findCleanup(layout([[app('a')]]))).toEqual([])
  })
})

describe('applyCleanup', () => {
  const messy = layout([[app('a'), folder('one', [app('b')]), app('c')], [], [app('d')]])

  it('puts the app in the folder’s slot and removes the empty page', () => {
    expect(ids(applyCleanup(messy, findCleanup(messy)))).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('only fixes what was chosen', () => {
    const [folderIssue, pageIssue] = findCleanup(messy)
    expect(ids(applyCleanup(messy, [pageIssue!]))).toEqual([['a', 'one', 'c'], ['d']])
    expect(ids(applyCleanup(messy, [folderIssue!]))).toEqual([['a', 'b', 'c'], [], ['d']])
    expect(applyCleanup(messy, []).pages).toEqual(messy.pages)
  })

  it('keeps every app, so the result validates', () => {
    expect(validateLayout(messy, applyCleanup(messy, findCleanup(messy)))).toEqual([])
  })
})

describe('on the messy fixture', () => {
  const dir = join(__dirname, '../../../../tests/fixtures')
  const raw: RawIconState = JSON.parse(
    readFileSync(join(dir, 'iphone-messy.json'), 'utf8')
  ).rawState
  const before = normalize(raw, gridFor('iPhone'))

  it('finds 2 empty pages and 3 one-app folders, and fixing all leaves none', () => {
    const issues = findCleanup(before)
    expect(issues.filter((i) => i.kind === 'empty-page')).toHaveLength(2)
    expect(issues.filter((i) => i.kind === 'one-app-folder').map((i) => i.name)).toEqual([
      'Games',
      'Banking',
      'New'
    ])
    const after = applyCleanup(before, issues)
    expect(findCleanup(after)).toEqual([])
    expect(validateLayout(before, after)).toEqual([])
  })
})
