import { isStack } from '@shared/layout/place'
import type { LayoutItem } from '@shared/types'
import { FolderTile } from './FolderTile'
import { IconTile } from './IconTile'
import s from './tiles.module.css'
import { WidgetTile } from './WidgetTile'

export function ItemTile({
  item,
  udid,
  label = true
}: {
  item: LayoutItem
  udid: string
  label?: boolean
}) {
  switch (item.kind) {
    case 'app':
      return <IconTile udid={udid} app={item} label={label} />
    case 'folder':
      return <FolderTile udid={udid} folder={item} label={label} />
    case 'widget':
      return <WidgetTile stack={isStack(item)} />
    case 'other': {
      // web clips and anything unrecognised
      const name = typeof item.raw['displayName'] === 'string' ? item.raw['displayName'] : 'Item'
      return (
        <div className={s.tile} data-kind="other" title={name}>
          <div
            className={`${s.icon} ${s.fallback}`}
            style={{ background: 'hsl(210 12% 52%)' }}
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase()}
          </div>
          {label && <span className={s.label}>{name}</span>}
        </div>
      )
    }
  }
}
