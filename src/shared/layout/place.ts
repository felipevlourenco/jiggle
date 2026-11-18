import type { Grid, LayoutItem } from '../types'

export interface Placement {
  item: LayoutItem
  col: number
  row: number
  w: number
  h: number
}

// How many grid cells an item covers. Apps, folders and web clips take one.
export function itemSpan(item: LayoutItem, grid: Grid): { w: number; h: number } {
  if (item.kind !== 'widget') return { w: 1, h: 1 }
  switch (item.raw['gridSize']) {
    case 'small':
      return { w: Math.min(2, grid.columns), h: 2 }
    case 'large':
    case 'extraLarge':
      return { w: grid.columns, h: 4 }
    default: // 'medium', and anything we don't know: full width, two rows
      return { w: grid.columns, h: 2 }
  }
}

// The phone stores a page as an ordered list with no coordinates. Each item takes the first
// free spot (left to right, top to bottom) where it fits; wide items sit on multiples of their width.
export function placeItems(items: LayoutItem[], grid: Grid): Placement[] {
  const used: boolean[][] = []
  const fits = (row: number, col: number, w: number, h: number): boolean => {
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) if (used[r]?.[c]) return false
    return true
  }
  return items.map((item) => {
    const { w, h } = itemSpan(item, grid)
    for (let row = 0; ; row++) {
      for (let col = 0; col + w <= grid.columns; col += w) {
        if (!fits(row, col, w, h)) continue
        for (let r = row; r < row + h; r++) {
          used[r] ??= []
          for (let c = col; c < col + w; c++) used[r]![c] = true
        }
        return { item, col, row, w, h }
      }
    }
  })
}
