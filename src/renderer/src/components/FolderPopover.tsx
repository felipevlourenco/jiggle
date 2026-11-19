import type { FolderItem } from '@shared/types'
import e from './editor.module.css'
import { ItemTile } from './ItemTile'
import t from './tiles.module.css'

// A folder opened to look inside, over the phone screen it sits on. Read-only; click outside to close.
export function FolderPopover({
  folder,
  udid,
  onClose
}: {
  folder: FolderItem
  udid: string
  onClose: () => void
}) {
  return (
    <div className={e.panelBackdrop} onClick={onClose}>
      <div
        className={e.panel}
        role="dialog"
        aria-label={`Folder ${folder.name}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className={e.panelHead}>
          <strong>{folder.name}</strong>
          <button className={e.panelClose} aria-label="Close folder" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={e.panelGrid}>
          {folder.pages.flat().map((app) => (
            <div key={app.id} className={t.cell}>
              <ItemTile item={app} udid={udid} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
