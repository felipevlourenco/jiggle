import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'

const SLIDE_MS = 220

// One draggable, droppable cell of the home screen in Edit mode. The drag handle is the cell itself,
// so a keyboard can reach it (Tab, Space to pick up, arrows to move, Space to drop).
export function DragCell({
  id,
  className,
  style,
  dropTarget = true,
  draggable = true,
  onClick,
  children,
  ...rest
}: {
  id: string
  className?: string
  style?: CSSProperties
  dropTarget?: boolean // false: can be picked up but nothing is dropped on it (apps in the folder panel)
  draggable?: boolean // false: widgets and the like stay put but still take a drop next to them
  onClick?: () => void
  children: ReactNode
  'data-moved'?: true
}) {
  const drag = useDraggable({ id: `drag:${id}`, disabled: !draggable })
  const drop = useDroppable({ id: `cell:${id}`, disabled: !dropTarget })
  const { active } = useDndContext()
  const node = useRef<HTMLDivElement | null>(null)
  const last = useRef<{ left: number; top: number } | null>(null)
  // While something is dragged the others slide to their new places (the page reflows live, like on the phone).
  // offsetLeft/Top are layout positions in the cell's own pixels: they ignore the phone frame's zoom and the
  // slide itself, so a slide in progress doesn't feed back into the next one.
  useLayoutEffect(() => {
    const el = node.current
    if (!el) return
    const now = { left: el.offsetLeft, top: el.offsetTop }
    const before = last.current
    last.current = now
    if (!before || !active || !dropTarget) return
    const [dx, dy] = [before.left - now.left, before.top - now.top]
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    // The tile slides, not the cell: the cell is the drop spot and has to be where it will end up, right away.
    ;(el.firstElementChild as HTMLElement | null)?.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      {
        duration: SLIDE_MS,
        easing: 'ease-out'
      }
    )
  })
  return (
    <div
      ref={(el) => {
        node.current = el
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      className={className}
      style={{ ...style, opacity: drag.isDragging ? 0.25 : undefined }}
      onClick={onClick}
      {...(draggable ? drag.attributes : {})}
      {...(draggable ? drag.listeners : {})}
      {...rest}
    >
      {children}
    </div>
  )
}

// An area that takes a drop on its empty space: the end of a page, or of the dock.
export function DropZone({
  id,
  className,
  style,
  children,
  ...rest
}: {
  id: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  'data-testid'?: string
}) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={className} style={style} {...rest}>
      {children}
    </div>
  )
}
