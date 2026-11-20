import { describe, expect, it } from 'vitest'
import type { AppItem, Layout, LayoutItem, WidgetItem } from '../../types'
import { NO_PINS, toggleAppPin } from '../pins'
import { sortLayout, type SortOptions } from '../sort'

const app = (name: string): AppItem => ({
  kind: 'app',
  id: name,
  bundleId: name,
  name,
  raw: { bundleIdentifier: name, displayName: name }
})
const widget: WidgetItem = { kind: 'widget', id: 'w', raw: { gridSize: 'medium', id: 'w' } }
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({
  dock,
  pages,
  grid: { columns: 4, rows: 6, dockMax: 4 }
})
const names = (page: LayoutItem[] | undefined): string[] =>
  (page ?? []).map((i) => (i.kind === 'widget' ? '<w>' : 'name' in i ? i.name : '?'))
const opts = (pins: SortOptions['pins'], widgetMode: SortOptions['widgetMode'] = 'keep-pages') =>
  ({ by: 'name', widgetMode, pins }) as const

describe('sort with pins', () => {
  it('an app pin keeps the app on its page and slot; the rest sorts around it', () => {
    const out = sortLayout(
      layout([
        [app('D'), app('C')],
        [app('B'), app('Z'), app('A')]
      ]),
      opts({ apps: ['Z'], page1: false })
    )
    expect(names(out.pages[0])).toEqual(['A', 'B'])
    expect(names(out.pages[1])).toEqual(['C', 'Z', 'D'])
  })

  it('pinning page 1 leaves it identical; the other pages still sort', () => {
    const page1 = [app('Zed'), app('Yak')]
    const out = sortLayout(
      layout([page1, [app('M'), app('B')], [app('K'), app('A')]]),
      opts({ apps: [], page1: true })
    )
    expect(out.pages[0]).toBe(page1)
    expect(names(out.pages[1])).toEqual(['A', 'B'])
    expect(names(out.pages[2])).toEqual(['K', 'M'])
  })

  it('page 1 and an app pin together', () => {
    const out = sortLayout(
      layout([[app('Q'), app('P')], [app('Y'), app('B'), app('X')], [app('A')]]),
      opts({ apps: ['X'], page1: true })
    )
    expect(names(out.pages[0])).toEqual(['Q', 'P'])
    expect(names(out.pages[1])).toEqual(['A', 'B', 'X'])
    expect(names(out.pages[2])).toEqual(['Y'])
  })

  it('never moves the dock', () => {
    const dock = [app('Phone'), app('Safari')]
    const out = sortLayout(layout([[app('B'), app('A')]], dock), opts({ apps: ['B'], page1: true }))
    expect(out.dock).toBe(dock)
  })

  it('keeps widget pages where they are, so page numbers hold', () => {
    const widgets = [widget, app('Z')]
    const out = sortLayout(
      layout([[app('B'), app('A')], widgets, [app('D'), app('C')]]),
      opts({ apps: ['D'], page1: false })
    )
    expect(out.pages[1]).toBe(widgets)
    expect(names(out.pages[0])).toEqual(['A', 'B'])
    expect(names(out.pages[2])).toEqual(['D', 'C'])
  })

  it('sort-around keeps widgets in their slots and fills the apps in order', () => {
    const out = sortLayout(
      layout([[widget, app('B'), app('A'), app('C')]]),
      opts({ apps: ['C'], page1: false }, 'sort-around')
    )
    expect(names(out.pages[0])).toEqual(['<w>', 'A', 'B', 'C'])
  })

  it('fill sorts widget pages too: widgets keep their slots and page numbers, pins still hold', () => {
    const input = layout([
      [app('D'), app('C')],
      [widget, app('Z'), app('B'), app('A')]
    ])
    const out = sortLayout(input, { by: 'name', widgetMode: 'fill' })
    expect(names(out.pages[0])).toEqual(['A', 'B'])
    expect(names(out.pages[1])).toEqual(['<w>', 'C', 'D', 'Z'])
    const pinned = sortLayout(input, opts({ apps: ['Z'], page1: false }, 'fill'))
    expect(names(pinned.pages[1])).toEqual(['<w>', 'Z', 'C', 'D']) // Z stays in its slot
  })

  it('without pins, uses the normal packing', () => {
    const input = layout([[app('B')], [app('A')]])
    expect(sortLayout(input, opts(NO_PINS)).pages.map((p) => p.length)).toEqual([2])
  })

  it('toggles an app pin on and off', () => {
    const on = toggleAppPin(NO_PINS, 'a')
    expect(on.apps).toEqual(['a'])
    expect(toggleAppPin(on, 'a')).toEqual(NO_PINS)
  })
})
