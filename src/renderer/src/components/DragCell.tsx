import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { CSSProperties, ReactNode } from 'react'

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
  return (
    <div
      ref={(el) => {
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
