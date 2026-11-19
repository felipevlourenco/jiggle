import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AppItem, LayoutItem, RawIconState, WidgetItem } from '../../types'
import { gridFor } from '../grid'
import { normalize } from '../normalize'
import { placeItems } from '../place'
import { summarize } from '../summarize'

const grid = gridFor('iPhone')
const app = (n: number): AppItem => ({
  kind: 'app',
  id: `a${n}`,
  bundleId: `a${n}`,
  name: `A${n}`,
  raw: {}
})
const widget = (gridSize: string): WidgetItem => ({
  kind: 'widget',
  id: `w-${gridSize}`,
  raw: { gridSize }
})
const at = (items: LayoutItem[]) => placeItems(items, grid).map((p) => [p.col, p.row, p.w, p.h])

describe('placeItems', () => {
  it('fills rows left to right', () => {
    expect(at([app(1), app(2), app(3), app(4), app(5)])).toEqual([
      [0, 0, 1, 1],
      [1, 0, 1, 1],
      [2, 0, 1, 1],
      [3, 0, 1, 1],
      [0, 1, 1, 1]
    ])
  })

  it('puts a medium widget across two rows, with icons after it', () => {
    expect(at([widget('medium'), app(1), app(2)])).toEqual([
      [0, 0, 4, 2],
      [0, 2, 1, 1],
      [1, 2, 1, 1]
    ])
  })

  it('pairs small widgets side by side', () => {
    expect(at([widget('small'), widget('small'), app(1)])).toEqual([
      [0, 0, 2, 2],
      [2, 0, 2, 2],
      [0, 2, 1, 1]
    ])
  })

  it('moves a small widget to the next aligned spot instead of straddling', () => {
    expect(at([app(1), widget('small')])[1]).toEqual([2, 0, 2, 2])
  })

  it('lets later icons fill a gap a wide widget left behind', () => {
    const placed = at([app(1), widget('medium'), app(2)])
    expect(placed[1]).toEqual([0, 1, 4, 2]) // below the first row
    expect(placed[2]).toEqual([1, 0, 1, 1]) // backfills the first row
  })
})

describe('real widget pages', () => {
  const raw: RawIconState = JSON.parse(
    readFileSync(join(__dirname, '../../../../tests/fixtures/iphone-widgets.json'), 'utf8')
  ).rawState
  const layout = normalize(raw, grid)

  it('a widget page fills exactly the 24 cells of the grid, without overlaps', () => {
    for (const page of [layout.pages[0]!, layout.pages[1]!]) {
      const placed = placeItems(page, grid)
      const cells = new Set<string>()
      for (const p of placed)
        for (let r = p.row; r < p.row + p.h; r++)
          for (let c = p.col; c < p.col + p.w; c++) cells.add(`${r},${c}`)
      expect(cells.size).toBe(24)
      expect(Math.max(...placed.map((p) => p.row + p.h))).toBe(grid.rows)
    }
  })

  it('summarizes the layout', () => {
    const summary = summarize(layout)
    expect(summary).toMatchObject({ pages: 6, widgets: 2 })
    expect(summary.apps).toBeGreaterThan(100) // dock, pages and folders all count
  })
})

describe('placeItems on an iPad (6 columns)', () => {
  const ipad = gridFor('iPad')
  const spots = (items: LayoutItem[]) =>
    placeItems(items, ipad).map((p) => [p.col, p.row, p.w, p.h])

  it('a medium widget is 4 × 2, with icons beside it and under it', () => {
    expect(spots([widget('medium'), app(1), app(2), app(3), app(4), app(5)])).toEqual([
      [0, 0, 4, 2],
      [4, 0, 1, 1],
      [5, 0, 1, 1],
      [4, 1, 1, 1],
      [5, 1, 1, 1],
      [0, 2, 1, 1]
    ])
  })

  it('a large widget is 4 × 4, an extra large one 6 × 4', () => {
    expect(spots([widget('large')])).toEqual([[0, 0, 4, 4]])
    expect(spots([widget('extraLarge')])).toEqual([[0, 0, 6, 4]])
  })

  it('still spans the iPhone’s whole width there', () => {
    expect(at([widget('medium')])).toEqual([[0, 0, 4, 2]])
    expect(at([widget('large')])).toEqual([[0, 0, 4, 4]])
  })
})
