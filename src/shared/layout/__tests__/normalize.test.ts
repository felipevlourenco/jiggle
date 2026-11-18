import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawIconState } from '../../types'
import { gridFor, pageCapacity } from '../grid'
import { normalize } from '../normalize'
import { serialize } from '../serialize'

const dir = join(__dirname, '../../../../tests/fixtures')
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'))
const load = (file: string): RawIconState =>
  JSON.parse(readFileSync(join(dir, file), 'utf8')).rawState
const grid = gridFor('iPhone')

describe('normalize / serialize', () => {
  it('treats an icon that only has a displayIdentifier as an app, and keeps its raw dict', () => {
    const raw: RawIconState = [[], [{ displayIdentifier: 'com.waze.iphone', displayName: 'Waze' }]]
    const [waze] = normalize(raw, grid).pages[0]!
    expect(waze).toMatchObject({ kind: 'app', bundleId: 'com.waze.iphone', name: 'Waze' })
    expect(serialize(normalize(raw, grid))).toEqual(raw)
  })

  it('finds the fixtures', () => expect(fixtures.length).toBeGreaterThanOrEqual(7))

  it.each(fixtures)('round-trips %s exactly', (file) => {
    const raw = load(file)
    expect(serialize(normalize(raw, grid))).toEqual(raw)
  })

  it('classifies items on the widgets fixture (a real phone)', () => {
    const { dock, pages } = normalize(load('iphone-widgets.json'), grid)
    const kinds = pages.flat().map((i) => i.kind)
    expect(dock.every((i) => i.kind === 'app')).toBe(true)
    expect(kinds.filter((k) => k === 'widget')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'folder')).toHaveLength(1)
    // the two icons that only have a displayIdentifier are apps, not unknown items
    expect(kinds.filter((k) => k === 'other')).toHaveLength(0)
  })

  it('keeps empty pages and one-app folders on the messy fixture', () => {
    const { pages } = normalize(load('iphone-messy.json'), grid)
    expect(pages.filter((p) => p.length === 0)).toHaveLength(2)
    const oneApp = pages.flat().filter((i) => i.kind === 'folder' && i.pages.flat().length === 1)
    expect(oneApp).toHaveLength(3)
  })

  it('leaves a folder with something unusual inside as an untouched "other" item', () => {
    const odd = {
      listType: 'folder',
      displayName: 'Odd',
      iconLists: [[{ displayName: 'no identifier at all' }]]
    }
    const raw: RawIconState = [[], [odd]]
    const layout = normalize(raw, grid)
    expect(layout.pages[0]![0]!.kind).toBe('other')
    expect(serialize(layout)).toEqual(raw)
  })

  it('serializes a moved app into its new folder position', () => {
    const layout = normalize(load('iphone-basic.json'), grid)
    const folder = layout.pages.flat().find((i) => i.kind === 'folder')!
    if (folder.kind !== 'folder') throw new Error('no folder')
    const moved = folder.pages[0]!.pop()!
    const out = serialize(layout)
    const rawFolder = out.flat().find((i) => i['listType'] === 'folder')!
    expect((rawFolder['iconLists'] as unknown[][])[0]).not.toContainEqual(moved.raw)
  })
})

describe('grid', () => {
  it('uses the phone-reported grid, else the table', () => {
    expect(gridFor('iPhone', { columns: 5, rows: 6, dockMax: 4 }).columns).toBe(5)
    expect(pageCapacity(gridFor('iPhone'))).toBe(24)
    expect(pageCapacity(gridFor('iPad'))).toBe(30)
  })
})
