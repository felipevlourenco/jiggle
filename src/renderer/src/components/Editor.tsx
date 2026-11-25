import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter
} from '@dnd-kit/core'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { findItem, locate, makeFolder, moveItems, type DropTarget } from '@shared/layout/edit'
import type { FolderItem, Layout } from '@shared/types'
import { DragCell, DropZone } from './DragCell'
import { ItemTile } from './ItemTile'
import e from './editor.module.css'
import t from './tiles.module.css'

const FLIP_MS = 700 // hover a page edge this long to turn the page
const MAKE_ROOM_MS = 250 // rest on an icon this long and the others make room (passing over one does nothing)

// What is being dragged, and whether it has left its open folder (which then steps aside).
const ActiveContext = createContext<{ id: string | null; leftFolder: boolean }>({
  id: null,
  leftFolder: false
})

// Prefer a page edge, then the icon under the pointer, then the page or dock itself. With a keyboard there
// is no pointer, so the nearest icon wins.
const detect: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  // Over an open folder's panel, only the panel counts: the page behind it can't be dropped on until the icon leaves.
  const isPanel = (id: unknown): boolean =>
    !!args.droppableContainers.find((c) => c.id === id)?.data.current?.['panel']
  const inPanel = hits.filter((h) => isPanel(h.id))
  if (inPanel.length) {
    const cells = inPanel.filter((h) => String(h.id).startsWith('cell:'))
    return cells.length ? cells : inPanel
  }
  const flip = hits.filter((h) => String(h.id).startsWith('flip:'))
  if (flip.length) return flip
  const cells = hits.filter((h) => String(h.id).startsWith('cell:'))
  if (cells.length) return cells
  if (hits.length) return hits
  if (args.pointerCoordinates) return []
  const own = args.droppableContainers.filter((c) => String(c.id).startsWith('cell:'))
  return closestCenter({
    ...args,
    droppableContainers: own.length ? own : args.droppableContainers
  })
}

// Arrow keys move the picked-up icon one cell at a time.
const stepByCell: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const rect = context.collisionRect
  if (!rect) return undefined
  const { x, y } = currentCoordinates
  switch (event.code) {
    case 'ArrowRight':
      return { x: x + rect.width, y }
    case 'ArrowLeft':
      return { x: x - rect.width, y }
    case 'ArrowDown':
      return { x, y: y + rect.height }
    case 'ArrowUp':
      return { x, y: y - rect.height }
  }
  return undefined
}

// Where a drop lands: an icon's slot, a folder, the end of a page or the dock. Null: nowhere.
function resolve(layout: Layout, group: string[], overId: string): DropTarget | null {
  if (overId.startsWith('page:')) {
    const page = Number(overId.slice(5))
    return { zone: 'page', page, index: layout.pages[page]?.length ?? 0 }
  }
  if (overId === 'dock') return { zone: 'dock', index: layout.dock.length }
  if (!overId.startsWith('cell:')) return null
  const id = overId.slice(5)
  if (group.includes(id)) return null
  const at = locate(layout, id)
  if (at?.zone === 'folder') {
    // Over an app in an open folder: reorder, when everything dragged is in that same folder.
    const together = group.every((g) => {
      const from = locate(layout, g)
      return from?.zone === 'folder' && from.folderId === at.folderId
    })
    if (!together) return null
    const open = [...layout.dock, ...layout.pages.flat()].find((i) => i.id === at.folderId)
    const flat = open?.kind === 'folder' ? open.pages.flat() : []
    return { zone: 'folder', folderId: at.folderId, index: flat.findIndex((a) => a.id === id) }
  }
  if (!at) return null
  const over = findItem(layout, id)
  if (over?.kind === 'folder' && group.every((g) => findItem(layout, g)?.kind === 'app')) {
    return { zone: 'folder', folderId: id }
  }
  return at.zone === 'dock'
    ? { zone: 'dock', index: at.index }
    : { zone: 'page', page: at.page, index: at.index }
}

// Drag and drop for the home screen (Edit mode): pointer and keyboard, page flipping at the edges.
export function EditorDnd({
  layout,
  zoom,
  udid,
  selected,
  onSelect,
  onChange,
  onPreview,
  onFlip,
  onDone,
  children
}: {
  layout: Layout
  zoom: number
  udid: string
  // The icons picked with ⌘-click or shift-click: dragging one of them moves all of them.
  selected: ReadonlySet<string>
  onSelect: (next: ReadonlySet<string>) => void
  onChange: (next: Layout) => void
  // The layout as it would be if the dragged item were dropped here, or null. The page shows it live.
  onPreview: (next: Layout | null) => void
  onFlip: (direction: -1 | 1) => void
  onDone: (keepFolder: boolean) => void // a drag ended: close the folder panel, unless it was a reorder inside it
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: stepByCell })
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(64)
  const [flip, setFlip] = useState<-1 | 1 | null>(null)
  const [leftFolder, setLeftFolder] = useState(false)
  const alt = useRef(false) // Option held: dropping on an app makes a folder
  const [notice, setNotice] = useState<string>()
  const preview = useRef<Layout | null>(null)
  const [previewed, setPreviewed] = useState<Layout | null>(null) // the same, to re-measure when it changes
  const room = useRef<number>(undefined)
  // What the drag was last reported over. The drop uses this: the `over` on dnd-kit's drop event can be one
  // render behind (right as the icons make room it still names the old target, and a drop would undo the move).
  const lastOver = useRef('')
  const setPreview = (next: Layout | null): void => {
    preview.current = next
    setPreviewed(next)
    onPreview(next)
  }
  const latest = useRef(onFlip)
  useEffect(() => {
    latest.current = onFlip
  })

  useEffect(() => {
    if (!flip) return
    const timer = window.setInterval(() => latest.current(flip), FLIP_MS)
    return () => window.clearInterval(timer)
  }, [flip])
  useEffect(() => {
    if (activeId === null) return
    const track = (ev: KeyboardEvent): void => {
      alt.current = ev.altKey
    }
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    return () => {
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
    }
  }, [activeId])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(undefined), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const end = (keepFolder = false): void => {
    window.clearTimeout(room.current)
    setPreview(null)
    setActiveId(null)
    setLeftFolder(false)
    setFlip(null)
    onDone(keepFolder)
  }
  const onStart = (ev: DragStartEvent): void => {
    alt.current = (ev.activatorEvent as { altKey?: boolean }).altKey ?? false
    lastOver.current = ''
    setActiveId(String(ev.active.id).slice('drag:'.length))
    setWidth(ev.active.rect.current.initial?.width ?? 64)
  }
  // Everything below works on what is on screen: the preview once the dragged icon has moved, else the layout.
  const shown = (): Layout => preview.current ?? layout
  // What a drag moves: the whole selection when the dragged icon is part of it, else just that icon.
  const groupOf = (id: string): string[] =>
    selected.has(id) && selected.size > 1 ? [...selected] : [id]
  // ⌥ on a single app dropped on another app makes a folder: the layout that drop would give, else null
  const folderFrom = (id: string, over: string): Layout | null =>
    alt.current && over.startsWith('cell:') && groupOf(id).length === 1
      ? makeFolder(shown(), id, over.slice(5))
      : null
  const onOver = (ev: DragOverEvent): void => {
    const over = ev.over ? String(ev.over.id) : ''
    lastOver.current = over
    setFlip(over === 'flip:-1' ? -1 : over === 'flip:1' ? 1 : null)
    // Resting on another icon, or on the end of a page or the dock: the others make room. A folder, or a full
    // place, moves nothing. Its own gap (it has already moved there) keeps things as they are.
    window.clearTimeout(room.current)
    const id = String(ev.active.id).slice('drag:'.length)
    const group = groupOf(id)
    // An app dragged out of its open folder: once the pointer leaves the panel, the panel steps aside.
    if (locate(layout, id)?.zone === 'folder' && !isInPanel(over)) setLeftFolder(true)
    const target = over ? resolve(shown(), group, over) : null
    if (target && target.zone !== 'folder') {
      room.current = window.setTimeout(() => {
        // Not an app a ⌥ drop would fold into: if it moved aside, the drop would only reorder.
        if (folderFrom(id, over)) return
        const next = moveItems(shown(), group, target)
        if (!next) return
        lastOver.current = `cell:${id}` // the drag is over its own gap now, even before the screen shows it
        setPreview(next)
      }, MAKE_ROOM_MS)
    }
  }
  const isInPanel = (over: string): boolean =>
    over.startsWith('panel:') ||
    (over.startsWith('cell:') && locate(layout, over.slice(5))?.zone === 'folder')
  const onEnd = (ev: DragEndEvent): void => {
    const id = String(ev.active.id).slice('drag:'.length)
    const group = groupOf(id)
    const over = lastOver.current
    const made = folderFrom(id, over)
    if (made) {
      onChange(made)
    } else if (group.some((g) => over === `cell:${g}`)) {
      if (preview.current) onChange(preview.current) // dropped in the gap it opened
    } else {
      const target = over ? resolve(shown(), group, over) : null
      if (target) {
        const next = moveItems(shown(), group, target)
        if (next === null) setNotice('Can’t move it there: that page, dock or folder is full.')
        else onChange(next)
      }
    }
    if (selected.size > 0) onSelect(new Set())
    // Reordering inside the open folder leaves it open; dragging out of it, or anywhere else, closes it.
    end(locate(layout, id)?.zone === 'folder' && !leftFolder)
  }

  const active = activeId ? findItem(layout, activeId) : null
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detect}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={() => end()}
    >
      <ActiveContext.Provider value={{ id: activeId, leftFolder }}>
        {children}
      </ActiveContext.Provider>
      <Remeasure watch={previewed} />
      <DragOverlay dropAnimation={null}>
        {active && (
          <div
            className={e.overlay}
            style={{
              width: width / zoom,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            <ItemTile item={active} udid={udid} />
            {groupOf(active.id).length > 1 && (
              <span className={e.count}>{groupOf(active.id).length}</span>
            )}
          </div>
        )}
      </DragOverlay>
      <p className={e.notice} role="status">
        {notice}
      </p>
    </DndContext>
  )
}

// Icons move while dragging, and dnd-kit only measures the drop spots when the drag starts: measure them again
// whenever the preview changes, so the next hover hits the icon that is now under the pointer.
function Remeasure({ watch }: { watch: unknown }) {
  const { measureDroppableContainers, droppableContainers } = useDndContext()
  useLayoutEffect(() => {
    if (watch) measureDroppableContainers([...droppableContainers.keys()])
  }, [watch, measureDroppableContainers, droppableContainers])
  return null
}

// Strips along the phone's left and right edge: hold an icon over one to turn the page.
// Always mounted in Edit mode so their positions are known when a drag starts; they only show while dragging.
export function FlipZones() {
  const dragging = useContext(ActiveContext).id !== null
  const cls = dragging ? '' : ` ${e.flipIdle}`
  return (
    <>
      <DropZone id="flip:-1" className={`${e.flip} ${e.flipLeft}${cls}`}>
        {null}
      </DropZone>
      <DropZone id="flip:1" className={`${e.flip} ${e.flipRight}${cls}`}>
        {null}
      </DropZone>
    </>
  )
}

// An open folder: its apps, to drag out onto the page. Hidden (but mounted) while something is dragged.
export function FolderPanel({
  folder,
  udid,
  onRename,
  onClose
}: {
  folder: FolderItem
  udid: string
  onRename: (name: string) => void
  onClose: () => void
}) {
  const { id, leftFolder } = useContext(ActiveContext)
  const [renaming, setRenaming] = useState(false)
  const apps = folder.pages.flat()
  // While an app of this folder is dragged inside it, the panel stays to reorder; dragging anything else, or
  // out past the panel, uncovers the page behind it.
  const hidden = id !== null && (!apps.some((a) => a.id === id) || leftFolder)
  const finish = (name: string): void => {
    setRenaming(false)
    if (name.trim() && name.trim() !== folder.name) onRename(name)
  }
  return (
    <div
      className={e.panelBackdrop}
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
      onClick={onClose}
    >
      <div
        className={e.panel}
        role="dialog"
        aria-label={`Folder ${folder.name}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className={e.panelHead}>
          {renaming ? (
            <input
              className={e.panelName}
              aria-label="Folder name"
              defaultValue={folder.name}
              autoFocus
              onFocus={(ev) => ev.currentTarget.select()}
              onBlur={(ev) => finish(ev.currentTarget.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') ev.currentTarget.blur()
                if (ev.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <strong title="Double-click to rename" onDoubleClick={() => setRenaming(true)}>
              {folder.name}
            </strong>
          )}
          <button className={e.panelClose} aria-label="Close folder" onClick={onClose}>
            ×
          </button>
        </div>
        <DropZone id={`panel:${folder.id}`} className={e.panelGrid} panel disabled={hidden}>
          {apps.map((app) => (
            <DragCell
              key={app.id}
              id={app.id}
              panel
              dropTarget={!hidden}
              className={`${t.cell} ${t.draggable}`}
            >
              <ItemTile item={app} udid={udid} />
            </DragCell>
          ))}
        </DropZone>
      </div>
    </div>
  )
}
