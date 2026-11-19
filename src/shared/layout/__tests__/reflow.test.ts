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
import { copyLayout, reflow } from '../reflow'
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

describe('copyLayout', () => {
  const big = { columns: 6, rows: 5, dockMax: 13 }
  const on = (l: Layout, grid = big): Layout => ({ ...l, grid })
  const keep = { widgetMode: 'keep-pages' } as const
  const flat = (l: Layout): string[] => l.pages.flat().map(label)

  // The source (an iPhone's) order is A F[B C] D E G; the target (an iPad) has other things too.
  const source = layout(
    [
      [app('A'), folder('F', app('B'), app('C')), app('D')],
      [app('E'), app('G'), app('Gone')]
    ],
    [app('Phone')]
  )
  const target = on(
    layout(
      [
        [app('G'), app('Z'), app('E')],
        [app('D'), app('C'), app('B'), app('A'), app('Y')]
      ],
      [app('Phone'), app('Mail')]
    )
  )

  it('shared apps follow the source’s order; target-only apps come last, A–Z; source-only are skipped', () => {
    const { layout: out, shared, targetOnly, sourceOnly } = copyLayout(source, target, keep)
    expect(flat(out)).toEqual(['A', 'F', 'D', 'E', 'G', 'Y', 'Z'])
    expect([shared, targetOnly, sourceOnly]).toEqual([7, 3, 1]) // Mail, Y and Z are the iPad's; Gone is the iPhone's
  })

  it('rebuilds a folder with the apps the target has, and drops one left with none', () => {
    const t = on(layout([[app('A'), app('B'), app('D')]]))
    const out = copyLayout(source, t, keep).layout
    const f = out.pages[0]!.find((i) => i.kind === 'folder') as FolderItem
    expect(f.pages.flat().map((a) => a.id)).toEqual(['B'])
    const none = copyLayout(source, on(layout([[app('A')]])), keep).layout
    expect(flat(none)).toEqual(['A'])
  })

  it('deals the sequence into pages as big as the target’s grid', () => {
    const many = layout([
      Array.from({ length: 24 }, (_, i) => app(`App ${String(i).padStart(2, '0')}`))
    ])
    const wide = on(
      layout([
        [
          ...many.pages[0]!,
          app('x1'),
          app('x2'),
          app('x3'),
          app('x4'),
          app('x5'),
          app('x6'),
          app('x7')
        ]
      ])
    )
    expect(copyLayout(many, wide, keep).layout.pages.map((p) => p.length)).toEqual([30, 1])
    // and the other way: a 30-icon iPad page onto the iPhone's 24
    const narrow = layout([[...many.pages[0]!, app('y1'), app('y2')]])
    expect(
      copyLayout(
        on(layout([many.pages[0]!.concat([app('y1'), app('y2')])])),
        narrow,
        keep
      ).layout.pages.map((p) => p.length)
    ).toEqual([24, 2])
  })

  it('leaves the target’s dock alone, and takes the source’s dock apps first when they are not in it', () => {
    const t = on(layout([[app('Phone2'), app('A')]], [app('Mail')]))
    const s = layout([[app('A')]], [app('Phone2')])
    const out = copyLayout(s, t, keep).layout
    expect(out.dock).toBe(t.dock)
    expect(flat(out)).toEqual(['Phone2', 'A'])
  })

  it('keep-pages: a target page with a widget stays exactly as it is, apps included', () => {
    const widgets = [widget, app('A'), app('Y')]
    const t = on(layout([[app('G'), app('E')], widgets]))
    const out = copyLayout(source, t, keep).layout
    expect(out.pages).toContain(widgets)
    expect(flat(out).filter((n) => n === 'A')).toHaveLength(1)
    expect(validateLayout(t, out).filter((i) => i.code !== 'missing-app')).toEqual([])
  })

  it('sort-around: the widget stays on its page and apps are dealt in around it', () => {
    const t = on(
      layout([
        [widget, app('A'), app('Y')],
        [app('G'), app('E')]
      ])
    )
    const out = copyLayout(source, t, { widgetMode: 'sort-around' }).layout
    expect(out.pages[0]![0]).toBe(widget)
    expect(flat(out).filter((n) => n !== '<widget>')).toEqual(['A', 'E', 'G', 'Y'])
    expect(validateLayout(t, out)).toEqual([])
  })

  it('on the fixtures: an iPhone layout on an iPad keeps every iPad app exactly once and validates', () => {
    const dir = join(__dirname, '../../../../tests/fixtures')
    const load = (name: string, cls: 'iPhone' | 'iPad') =>
      normalize(JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')).rawState, gridFor(cls))
    const phone = load('iphone-widgets', 'iPhone')
    for (const mode of ['keep-pages', 'sort-around'] as const) {
      const ipad = load('ipad-widgets', 'iPad')
      const out = copyLayout(phone, ipad, { widgetMode: mode }).layout
      expect(validateLayout(ipad, out)).toEqual([])
      expect(out.pages.every((p) => p.length <= 30)).toBe(true)
    }
  })
})
