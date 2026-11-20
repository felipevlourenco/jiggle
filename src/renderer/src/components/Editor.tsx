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
import { findItem, locate, moveItem, type DropTarget } from '@shared/layout/edit'
import type { FolderItem, Layout } from '@shared/types'
import { DragCell, DropZone } from './DragCell'
import { ItemTile } from './ItemTile'
import e from './editor.module.css'
import t from './tiles.module.css'

const FLIP_MS = 700 // hover a page edge this long to turn the page
const MAKE_ROOM_MS = 250 // rest on an icon this long and the others make room (passing over one does nothing)

const ActiveContext = createContext<string | null>(null)

// Prefer a page edge, then the icon under the pointer, then the page or dock itself. With a keyboard there
// is no pointer, so the nearest icon wins.
const detect: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
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
function resolve(layout: Layout, activeId: string, overId: string): DropTarget | null {
  if (overId.startsWith('page:')) {
    const page = Number(overId.slice(5))
    return { zone: 'page', page, index: layout.pages[page]?.length ?? 0 }
  }
  if (overId === 'dock') return { zone: 'dock', index: layout.dock.length }
  if (!overId.startsWith('cell:')) return null
  const id = overId.slice(5)
  if (id === activeId) return null
  const at = locate(layout, id)
  if (!at || at.zone === 'folder') return null
  const over = findItem(layout, id)
  if (over?.kind === 'folder' && findItem(layout, activeId)?.kind === 'app') {
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
  onChange,
  onPreview,
  onFlip,
  onDone,
  children
}: {
  layout: Layout
  zoom: number
  udid: string
  onChange: (next: Layout) => void
  // The layout as it would be if the dragged item were dropped here, or null. The page shows it live.
  onPreview: (next: Layout | null) => void
  onFlip: (direction: -1 | 1) => void
  onDone: () => void // a drag ended: close the folder panel
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: stepByCell })
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(64)
  const [flip, setFlip] = useState<-1 | 1 | null>(null)
  const [notice, setNotice] = useState<string>()
  const preview = useRef<Layout | null>(null)
  const [previewed, setPreviewed] = useState<Layout | null>(null) // the same, to re-measure when it changes
  const room = useRef<number>(undefined)
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
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(undefined), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const end = (): void => {
    window.clearTimeout(room.current)
    setPreview(null)
    setActiveId(null)
    setFlip(null)
    onDone()
  }
  const onStart = (ev: DragStartEvent): void => {
    setActiveId(String(ev.active.id).slice('drag:'.length))
    setWidth(ev.active.rect.current.initial?.width ?? 64)
  }
  // Everything below works on what is on screen: the preview once the dragged icon has moved, else the layout.
  const shown = (): Layout => preview.current ?? layout
  const onOver = (ev: DragOverEvent): void => {
    const over = ev.over ? String(ev.over.id) : ''
    setFlip(over === 'flip:-1' ? -1 : over === 'flip:1' ? 1 : null)
    // Resting on another icon, or on the end of a page or the dock: the others make room. A folder, or a full
    // place, moves nothing. Its own gap (it has already moved there) keeps things as they are.
    window.clearTimeout(room.current)
    const id = String(ev.active.id).slice('drag:'.length)
    const target = over ? resolve(shown(), id, over) : null
    if (target && target.zone !== 'folder') {
      room.current = window.setTimeout(() => {
        const next = moveItem(shown(), id, target)
        if (next) setPreview(next)
      }, MAKE_ROOM_MS)
    }
  }
  const onEnd = (ev: DragEndEvent): void => {
    const id = String(ev.active.id).slice('drag:'.length)
    const over = ev.over ? String(ev.over.id) : ''
    if (over === `cell:${id}`) {
      if (preview.current) onChange(preview.current) // dropped in the gap it opened
    } else {
      const target = over ? resolve(shown(), id, over) : null
      if (target) {
        const next = moveItem(shown(), id, target)
        if (next === null) setNotice('Can’t move it there: that page, dock or folder is full.')
        else onChange(next)
      }
    }
    end()
  }

  const active = activeId ? findItem(layout, activeId) : null
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detect}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={end}
    >
      <ActiveContext.Provider value={activeId}>{children}</ActiveContext.Provider>
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
  const dragging = useContext(ActiveContext) !== null
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
  onClose
}: {
  folder: FolderItem
  udid: string
  onClose: () => void
}) {
  const dragging = useContext(ActiveContext) !== null
  return (
    <div
      className={e.panelBackdrop}
      style={{ visibility: dragging ? 'hidden' : 'visible' }}
      onClick={onClose}
    >
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
            <DragCell
              key={app.id}
              id={app.id}
              dropTarget={false}
              className={`${t.cell} ${t.draggable}`}
            >
              <ItemTile item={app} udid={udid} />
            </DragCell>
          ))}
        </div>
      </div>
    </div>
  )
}
