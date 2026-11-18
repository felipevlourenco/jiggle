import type { LayoutItem } from '@shared/types'
import { DragCell, DropZone } from './DragCell'
import { ItemTile } from './ItemTile'
import s from './phone.module.css'
import t from './tiles.module.css'

// The dock shows icons without labels, like iOS. `edit`: Edit mode, so its icons can be dragged.
export function Dock({ items, udid, edit }: { items: LayoutItem[]; udid: string; edit?: boolean }) {
  if (!edit) {
    return (
      <div className={s.dock} data-testid="dock">
        {items.map((item) => (
          <ItemTile key={item.id} item={item} udid={udid} label={false} />
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
        >
          <ItemTile item={item} udid={udid} label={false} />
        </DragCell>
      ))}
    </DropZone>
  )
}
