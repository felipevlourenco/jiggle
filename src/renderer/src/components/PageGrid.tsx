import { placeItems } from '@shared/layout/place'
import type { Grid, LayoutItem } from '@shared/types'
import { DragCell, DropZone } from './DragCell'
import { ItemTile } from './ItemTile'
import s from './phone.module.css'
import t from './tiles.module.css'

// One home screen page: every item at the spot the phone would put it.
// `edit`: Edit mode. Apps and folders can be dragged; the page's empty space takes a drop at its end.
export function PageGrid({
  items,
  grid,
  udid,
  marked,
  edit
}: {
  items: LayoutItem[]
  grid: Grid
  udid: string
  marked?: ReadonlySet<string> // item ids that get a coral dot (moved by a sort)
  edit?: { page: number; onOpenFolder: (id: string) => void }
}) {
  const props = {
    className: edit ? `${s.grid} ${t.jiggle}` : s.grid,
    style: { gridTemplateColumns: `repeat(${grid.columns}, 1fr)` },
    'data-testid': 'page'
  }
  const cells = placeItems(items, grid).map(({ item, col, row, w, h }) => {
    const common = {
      className: `${t.cell} ${item.kind === 'widget' ? t.cellWide : ''}`,
      style: { gridColumn: `${col + 1} / span ${w}`, gridRow: `${row + 1} / span ${h}` },
      'data-moved': marked?.has(item.id) || undefined
    }
    if (!edit) {
      return (
        <div key={item.id} {...common}>
          <ItemTile item={item} udid={udid} />
        </div>
      )
    }
    const movable = item.kind === 'app' || item.kind === 'folder'
    return (
      <DragCell
        key={item.id}
        id={item.id}
        draggable={movable}
        {...common}
        className={`${common.className} ${movable ? t.draggable : ''}`}
        onClick={item.kind === 'folder' ? () => edit.onOpenFolder(item.id) : undefined}
      >
        <ItemTile item={item} udid={udid} />
      </DragCell>
    )
  })
  return edit ? (
    <DropZone id={`page:${edit.page}`} {...props}>
      {cells}
    </DropZone>
  ) : (
    <div {...props}>{cells}</div>
  )
}
