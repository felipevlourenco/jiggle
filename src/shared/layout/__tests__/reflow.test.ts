import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  AppItem,
  Device,
  FolderItem,
  Layout,
  LayoutItem,
  RawIconState,
  WidgetItem
} from '../../types'
import { gridFor } from '../grid'
import { normalize } from '../normalize'
import { reflow } from '../reflow'
import { serialize } from '../serialize'
import { layoutSignature } from '../signature'
import { validateLayout } from '../validate'

const app = (name: string, version = '1'): AppItem => ({
  kind: 'app',
  id: name,
  bundleId: name,
  name,
  raw: { bundleIdentifier: name, displayName: name, bundleVersion: version }
})
const folder = (name: string, ...apps: AppItem[]): FolderItem => ({
  kind: 'folder',
  id: `folder.${name}`,
  name,
  pages: [apps],
  raw: { listType: 'folder', displayName: name }
})
const widget: WidgetItem = { kind: 'widget', id: 'w', raw: { gridSize: 'medium', id: 'w' } }
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const label = (i: LayoutItem): string =>
  i.kind === 'widget' ? '<widget>' : i.kind === 'other' ? '<other>' : i.name
const shape = (l: Layout): string[][] => [l.dock.map(label), ...l.pages.map((p) => p.map(label))]

describe('reflow', () => {
  const saved = layout(
    [
      [app('A'), folder('F', app('B'), app('C')), app('D')],
      [app('E'), app('G')]
    ],
    [app('Phone')]
  )

  it('gives back the saved arrangement when the phone has the same apps', () => {
    const current = layout(
      [
        [app('G'), app('E')],
        [app('D'), app('C'), app('B'), app('A')]
      ],
      [app('Phone')]
    )
    expect(shape(reflow(saved, current))).toEqual(shape(saved))
  })

  it('takes the phone’s own dict for an app, so a newer version is not overwritten', () => {
    const current = layout([
      [app('A', '9'), app('Phone'), app('B'), app('C'), app('D'), app('E'), app('G')]
    ])
    const out = reflow(saved, current)
    expect((out.pages[0]![0] as AppItem).raw['bundleVersion']).toBe('9')
    expect((out.pages[0]![1] as FolderItem).pages[0]![0]!.raw['bundleVersion']).toBe('1')
  })

  it('drops apps the phone no longer has, then folders and pages that end up empty', () => {
    const current = layout([[app('A'), app('D'), app('Phone')]])
    const out = reflow(saved, current)
    expect(shape(out)).toEqual([['Phone'], ['A', 'D']])
  })

  it('adds apps that are new on the phone at the end, A–Z, on the last page', () => {
    const current = layout([
      [app('A'), app('B'), app('C'), app('D'), app('E'), app('G'), app('Phone')],
      [app('zed'), app('Mail'), app('Beta')]
    ])
    const out = reflow(saved, current)
    expect(shape(out).slice(1)).toEqual([
      ['A', 'F', 'D'],
      ['E', 'G', 'Beta', 'Mail', 'zed']
    ])
  })

  it('starts a new page when the last one is full', () => {
    const full = Array.from({ length: 24 }, (_, i) => app(`App ${String(i).padStart(2, '0')}`))
    const out = reflow(layout([full]), layout([[...full, app('New')]]))
    expect(out.pages.map((p) => p.length)).toEqual([24, 1])
  })

  it('places an app that sat in a folder on the phone but is new to the saved layout loose', () => {
    const current = layout([
      [app('A'), folder('Mine', app('B'), app('Fresh')), app('C'), app('D'), app('E'), app('G')]
    ])
    const out = reflow(saved, current)
    expect(out.pages.flat().filter((i) => i.kind === 'folder')).toHaveLength(1) // only the saved "F"
    expect(shape(out).flat()).toContain('Fresh')
    expect(validateLayout(current, out)).toEqual([])
  })

  it('brings the saved widgets along', () => {
    const withWidget = layout([[widget, app('A')]])
    const out = reflow(withWidget, layout([[app('A')]]))
    expect(out.pages[0]![0]).toBe(widget)
  })

  it('keeps the phone’s grid', () => {
    const current = { ...layout([[app('A')]]), grid: { columns: 6, rows: 5, dockMax: 13 } }
    expect(reflow(saved, current).grid).toBe(current.grid)
  })
})

describe('reflow on every fixture', () => {
  const dir = join(__dirname, '../../../../tests/fixtures')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const { rawState: raw, device }: { rawState?: RawIconState; device?: Device } = JSON.parse(
      readFileSync(join(dir, file), 'utf8')
    )
    if (!raw) continue
    it(`${file}: switching to what the phone already has changes nothing`, () => {
      const here = normalize(raw, gridFor(device?.deviceClass ?? 'iPhone'))
      const out = reflow(here, here)
      expect(layoutSignature(serialize(out))).toBe(layoutSignature(raw))
      expect(validateLayout(here, out)).toEqual([])
    })
  }
})
