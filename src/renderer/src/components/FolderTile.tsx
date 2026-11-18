import type { FolderItem } from '@shared/types'
import { AppIcon } from './IconTile'
import s from './tiles.module.css'

// A folder shows the first 9 apps of its first page as mini icons.
export function FolderTile({
  udid,
  folder,
  label = true
}: {
  udid: string
  folder: FolderItem
  label?: boolean
}) {
  const apps = (folder.pages[0] ?? []).slice(0, 9)
  return (
    <div className={s.tile} data-kind="folder" title={folder.name}>
      <div className={s.folder}>
        {apps.map((app) => (
          <AppIcon key={app.id} udid={udid} app={app} />
        ))}
      </div>
      {label && <span className={s.label}>{folder.name}</span>}
    </div>
  )
}
