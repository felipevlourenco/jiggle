import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AppItem, FolderItem, Layout, LayoutItem, RawIconState, WidgetItem } from '../../types'
import { countMoved, movedIds } from '../diff'
import { gridFor } from '../grid'
import { normalize } from '../normalize'
import { isStack } from '../place'
import { serialize } from '../serialize'
import { sortLayout } from '../sort'
import { validateLayout } from '../validate'

const grid = { columns: 4, rows: 6, dockMax: 4 }
const app = (name: string, bundleId = `app.${name.toLowerCase()}`): AppItem => ({
  kind: 'app',
  id: bundleId,
  bundleId,
  name,
  raw: { bundleIdentifier: bundleId, displayName: name }
})
const folder = (name: string, ...apps: AppItem[]): FolderItem => ({
  kind: 'folder',
  id: `folder.${name}`,
  name,
  pages: [apps],
  raw: { listType: 'folder', displayName: name }
})
const widget = (id = 'w1', gridSize = 'medium'): WidgetItem => ({
  kind: 'widget',
  id,
  raw: { gridSize, id }
})
const layout = (pages: LayoutItem[][], dock: LayoutItem[] = []): Layout => ({ dock, pages, grid })
const names = (page: LayoutItem[] | undefined): string[] =>
  (page ?? []).map((i) =>
    i.kind === 'widget' ? '<widget>' : i.kind === 'other' ? '<other>' : i.name
  )
const byName = { by: 'name', widgetMode: 'keep-pages' } as const

describe('sortLayout by name', () => {
  it('sorts A–Z ignoring case and accents', () => {
    const out = sortLayout(
      layout([[app('banana'), app('Éclair'), app('apple'), app('Cherry')]]),
      byName
    )
    expect(names(out.pages[0])).toEqual(['apple', 'banana', 'Cherry', 'Éclair'])
  })

  it('ignores invisible direction marks, so WhatsApp is not last', () => {
    const out = sortLayout(layout([[app('Zoom'), app('‎WhatsApp', 'wa'), app('Maps')]]), byName)
    expect(names(out.pages[0]).map((n) => n.replace(/‎/g, ''))).toEqual([
      'Maps',
      'WhatsApp',
      'Zoom'
    ])
  })

  it('sorts folders as single items by their name, apps stay inside', () => {
    const inner = app('Zed')
    const out = sortLayout(layout([[app('Travel'), folder('Games', inner), app('Alpha')]]), byName)
    expect(names(out.pages[0])).toEqual(['Alpha', 'Games', 'Travel'])
    expect((out.pages[0]![1] as FolderItem).pages).toEqual([[inner]])
  })

  it('packs pages from the top left: full pages first, the rest on the last', () => {
    const apps = Array.from({ length: 30 }, (_, i) => app(`App ${String(i).padStart(2, '0')}`))
    const out = sortLayout(
      layout([apps.slice(0, 10), apps.slice(10, 20), apps.slice(20)].reverse()),
      byName
    )
    expect(out.pages.map((p) => p.length)).toEqual([24, 6])
  })

  it('leaves the dock alone', () => {
    const dock = [app('Phone'), app('Safari')]
    const out = sortLayout(layout([[app('B'), app('A')]], dock), byName)
    expect(out.dock).toBe(dock)
  })

  it('is stable for equal names', () => {
    const first = app('Same', 'a.1')
    const second = app('same', 'a.2')
    expect(sortLayout(layout([[first, second]]), byName).pages[0]).toEqual([first, second])
  })
})

describe('sortLayout by category', () => {
  const cats: Record<string, string> = {
    'app.zeta': 'Games',
    'app.alpha': 'Music',
    'app.beta': 'Games',
    'app.mail': 'Apple'
  }
  const opts = {
    by: 'category',
    widgetMode: 'keep-pages',
    categoryOf: (id: string) => cats[id] ?? 'Unknown'
  } as const

  it('groups by category then name, folders first', () => {
    const out = sortLayout(
      layout([
        [app('Zeta'), app('Alpha'), folder('Stuff'), app('Mail'), app('Beta'), app('Mystery')]
      ]),
      opts
    )
    expect(names(out.pages[0])).toEqual(['Stuff', 'Mail', 'Beta', 'Zeta', 'Alpha', 'Mystery'])
    //                                    folder  Apple   Games: Beta, Zeta   Music  Unknown
  })
})

describe('sortLayout by color', () => {
  const colors: Record<string, { h: number; s: number; l: number }> = {
    'app.sky': { h: 210, s: 0.8, l: 0.5 },
    'app.rose': { h: 0, s: 0.8, l: 0.5 },
    'app.snow': { h: 0, s: 0, l: 0.97 },
    'app.lime': { h: 100, s: 0.8, l: 0.5 }
  }
  const opts = {
    by: 'color',
    widgetMode: 'keep-pages',
    colorOf: (id: string) => colors[id] ?? null
  } as const

  it('flows through the rainbow, neutrals and unread icons last, folders first', () => {
    const out = sortLayout(
      layout([[app('Snow'), app('Sky'), app('Unread'), folder('Stuff'), app('Rose'), app('Lime')]]),
      opts
    )
    expect(names(out.pages[0])).toEqual(['Stuff', 'Rose', 'Lime', 'Sky', 'Snow', 'Unread'])
  })

  it('breaks ties by name', () => {
    const same = { ...opts, colorOf: () => ({ h: 120, s: 0.8, l: 0.5 }) }
    expect(names(sortLayout(layout([[app('Zed'), app('Abe')]]), same).pages[0])).toEqual([
      'Abe',
      'Zed'
    ])
  })
})

describe('widget modes', () => {
  const widgetPage = [widget(), app('Zulu'), app('Yankee')]
  const input = (): Layout =>
    layout([[app('Delta'), app('Alpha')], widgetPage, [app('Charlie'), app('Bravo')]])

  it('keep-pages: a page with a widget stays exactly as it is, and comes first', () => {
    const out = sortLayout(input(), byName)
    expect(out.pages[0]).toBe(widgetPage)
    expect(names(out.pages[1])).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    expect(out.pages).toHaveLength(2)
  })

  it('sort-around: apps leave widget pages, only the widget stays', () => {
    const out = sortLayout(input(), { by: 'name', widgetMode: 'sort-around' })
    expect(names(out.pages[0])).toEqual(['<widget>'])
    expect(names(out.pages[1])).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Yankee', 'Zulu'])
  })

  it('treats unrecognised items like widgets', () => {
    const odd: LayoutItem = { kind: 'other', id: 'o', raw: { webClip: true } }
    const page = [app('B'), odd]
    expect(sortLayout(layout([page, [app('A')]]), byName).pages[0]).toBe(page)
  })
})

describe('validateLayout and countMoved on a sort', () => {
  const before = layout(
    [
      [widget(), app('Zulu')],
      [app('Delta'), folder('Games', app('Pong')), app('Alpha')]
    ],
    [app('Phone')]
  )

  it.each(['keep-pages', 'sort-around'] as const)(
    'a %s sort is valid and counts what moved',
    (widgetMode) => {
      const after = sortLayout(before, { by: 'name', widgetMode })
      expect(validateLayout(before, after)).toEqual([])
      expect(countMoved(before, after)).toBeGreaterThan(0)
      expect(countMoved(before, before)).toBe(0)
    }
  )

  it('names the apps and folders that moved, and nothing else', () => {
    const b = layout([[app('B'), app('A'), app('C')]])
    const after = sortLayout(b, byName)
    expect([...movedIds(b, after)].sort()).toEqual(['app.a', 'app.b']) // C stays put
    expect(countMoved(b, after)).toBe(2)
  })

  it('rejects a missing app, a duplicate app and an over-full page', () => {
    const missing = layout([[widget(), app('Zulu')], [app('Delta')]], [app('Phone')])
    expect(validateLayout(before, missing)).toContainEqual({
      code: 'missing-app',
      bundleId: 'app.alpha'
    })

    const dup = layout(
      [
        [widget(), app('Zulu')],
        [app('Delta'), app('Delta'), app('Alpha'), folder('Games', app('Pong'))]
      ],
      [app('Phone')]
    )
    expect(validateLayout(before, dup)).toContainEqual({
      code: 'duplicate-app',
      bundleId: 'app.delta'
    })

    const crowded = Array.from({ length: 25 }, (_, i) => app(`A${i}`))
    const b = layout([crowded.slice(0, 24), crowded.slice(24)])
    expect(validateLayout(b, layout([crowded]))).toEqual([{ code: 'page-over-capacity', page: 1 }])
  })

  it('accepts a deliberately removed app, rejects an app that was never there', () => {
    const without = layout(
      [
        [widget(), app('Zulu')],
        [app('Delta'), folder('Games', app('Pong'))]
      ],
      [app('Phone')]
    )
    expect(validateLayout(before, without, ['app.alpha'])).toEqual([])
    const extra = layout(
      [
        [widget(), app('Zulu')],
        [app('Delta'), folder('Games', app('Pong')), app('Alpha'), app('Ghost')]
      ],
      [app('Phone')]
    )
    expect(validateLayout(before, extra)).toEqual([{ code: 'unknown-app', bundleId: 'app.ghost' }])
  })

  it('rejects empty folders, a full dock overflow and a changed widget', () => {
    const empty = layout(
      [
        [widget(), app('Zulu')],
        [app('Delta'), folder('Games', app('Pong')), app('Alpha'), folder('Empty')]
      ],
      [app('Phone')]
    )
    expect(validateLayout(before, empty)).toEqual([{ code: 'empty-folder', name: 'Empty' }])

    const dock = layout(
      before.pages,
      Array.from({ length: 5 }, (_, i) => app(`D${i}`))
    )
    expect(validateLayout(layout(before.pages, []), dock)).toContainEqual({
      code: 'dock-over-max',
      count: 5
    })

    const edited = layout(
      [[{ ...widget(), raw: { gridSize: 'large', id: 'w1' } }, app('Zulu')], before.pages[1]!],
      [app('Phone')]
    )
    expect(validateLayout(before, edited)).toEqual([{ code: 'widget-changed' }])
  })

  it('counts a widget by the cells it covers', () => {
    // medium widget = 8 cells, so 17 apps fit beside it and an 18th does not
    const fits = Array.from({ length: 16 }, (_, i) => app(`F${i}`))
    const b = layout([[widget(), ...fits]])
    expect(validateLayout(b, b)).toEqual([])
    const over = layout([[widget(), ...fits, app('One'), app('Two')]])
    expect(validateLayout(layout([[widget(), ...fits, app('One'), app('Two')]]), over)).toEqual([
      { code: 'page-over-capacity', page: 1 }
    ])
  })
})

describe('sortLayout on a real phone (iphone-widgets fixture)', () => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../../../../tests/fixtures/iphone-widgets.json'), 'utf8')
  ).rawState
  const before = normalize(raw, grid)

  it.each(['keep-pages', 'sort-around'] as const)(
    '%s: every sorted page is full except the last, and nothing is lost',
    (widgetMode) => {
      const after = sortLayout(before, { by: 'name', widgetMode })
      expect(validateLayout(before, after)).toEqual([])
      const isSorted = (p: LayoutItem[]): boolean =>
        p.every((i) => i.kind === 'app' || i.kind === 'folder')
      const sorted = after.pages.filter(isSorted)
      sorted.slice(0, -1).forEach((p) => expect(p).toHaveLength(24))
      // no app left stranded alone on a widget page
      if (widgetMode === 'sort-around') {
        after.pages
          .filter((p) => !isSorted(p))
          .forEach((p) => expect(p.every((i) => i.kind === 'widget')).toBe(true))
      }
    }
  )
})

describe('widget stacks', () => {
  const raw: RawIconState = JSON.parse(
    readFileSync(join(__dirname, '../../../../tests/fixtures/iphone-stack.json'), 'utf8')
  ).rawState
  const before = normalize(raw, gridFor('iPhone'))
  const stackPage = before.pages.findIndex((p) => p.some(isStack))
  const stack = before.pages[stackPage]!.find(isStack)!

  it('the fixture has one stack, found as a stack', () => {
    expect(before.pages.flat().filter(isStack)).toHaveLength(1)
    expect(stack.kind).toBe('widget')
  })

  it.each(['keep-pages', 'sort-around', 'fill'] as const)(
    '%s: the stack keeps its slot on its page and the layout stays valid',
    (widgetMode) => {
      const after = sortLayout(before, { by: 'name', widgetMode })
      const page = after.pages.find((p) => p.includes(stack))!
      expect(page.indexOf(stack)).toBe(before.pages[stackPage]!.indexOf(stack))
      expect(validateLayout(before, after)).toEqual([])
      expect(serialize(after).flat()).toContain(stack.raw)
    }
  )
})
