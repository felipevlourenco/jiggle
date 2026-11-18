import { placeItems } from '@shared/layout/place'
import type { Grid, LayoutItem } from '@shared/types'
import { ItemTile } from './ItemTile'
import s from './phone.module.css'
import t from './tiles.module.css'

// One home screen page: every item at the spot the phone would put it.
export function PageGrid({
  items,
  grid,
  udid,
  marked
}: {
  items: LayoutItem[]
  grid: Grid
  udid: string
  marked?: ReadonlySet<string> // item ids that get a coral dot (moved by a sort)
}) {
  return (
    <div
      className={s.grid}
      style={{ gridTemplateColumns: `repeat(${grid.columns}, 1fr)` }}
      data-testid="page"
    >
      {placeItems(items, grid).map(({ item, col, row, w, h }) => (
        <div
          key={item.id}
          data-moved={marked?.has(item.id) || undefined}
          className={`${t.cell} ${item.kind === 'widget' ? t.cellWide : ''}`}
          style={{ gridColumn: `${col + 1} / span ${w}`, gridRow: `${row + 1} / span ${h}` }}
        >
          <ItemTile item={item} udid={udid} />
        </div>
      ))}
    </div>
  )
}
