import type { LayoutItem } from '@shared/types'
import { ItemTile } from './ItemTile'
import s from './phone.module.css'

// The dock shows icons without labels, like iOS.
export function Dock({ items, udid }: { items: LayoutItem[]; udid: string }) {
  return (
    <div className={s.dock} data-testid="dock">
      {items.map((item) => (
        <ItemTile key={item.id} item={item} udid={udid} label={false} />
      ))}
    </div>
  )
}
