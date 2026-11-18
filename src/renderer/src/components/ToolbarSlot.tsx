import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The toolbar's right-hand end. A screen puts its own actions there (Apply, Back Up Now, search).
export const ToolbarSlotContext = createContext<HTMLElement | null>(null)

export function ToolbarActions({ children }: { children: ReactNode }) {
  const slot = useContext(ToolbarSlotContext)
  return slot ? createPortal(children, slot) : null
}
