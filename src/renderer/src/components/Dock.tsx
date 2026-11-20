import type { LayoutItem } from '@shared/types'
import { DragCell, DropZone } from './DragCell'
import { ItemTile } from './ItemTile'
import s from './phone.module.css'
import t from './tiles.module.css'

// The dock shows icons without labels, like iOS. `edit`: Edit mode, so its icons can be dragged.
export function Dock({
  items,
  udid,
  edit,
  found
}: {
  items: LayoutItem[]
  udid: string
  edit?: boolean
  found?: string // the item a search is pointing at
}) {
  if (!edit) {
    return (
      <div className={s.dock} data-testid="dock">
        {items.map((item) => (
          <div key={item.id} data-found={found === item.id || undefined} className={t.found}>
            <ItemTile item={item} udid={udid} label={false} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <DropZone id="dock" className={`${s.dock} ${t.jiggle}`} data-testid="dock">
      {items.map((item) => (
        <DragCell
          key={item.id}
          id={item.id}
          draggable={item.kind === 'app' || item.kind === 'folder'}
          className={t.draggable}
          data-found={found === item.id || undefined}
        >
          <ItemTile item={item} udid={udid} label={false} />
        </DragCell>
      ))}
    </DropZone>
  )
}
