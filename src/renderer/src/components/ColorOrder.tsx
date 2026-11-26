import { useState } from 'react'
import {
  COLOR_FAMILIES,
  DEFAULT_COLOR_ORDER,
  pageGroupOf,
  type ColorFamily
} from '@shared/layout/color'
import s from './colorOrder.module.css'

const SWATCH: Record<ColorFamily, string> = {
  red: '#e5484d',
  orange: '#f5821f',
  yellow: '#f5c518',
  green: '#2fb463',
  teal: '#1fb5c4',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec6bb3',
  white: '#ffffff',
  grey: '#8e8e93',
  black: '#111113'
}

const move = (order: readonly ColorFamily[], from: number, to: number): ColorFamily[] => {
  const next = [...order]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  return next
}

// The color families in the order the sort will use. Drag a swatch to move it, or focus one and press
// Alt + ← / →. With one color per page, swatches that will share a page are drawn joined.
export function ColorOrder({
  order,
  perPage = false,
  onChange
}: {
  order: readonly ColorFamily[]
  perPage?: boolean
  onChange: (order: readonly ColorFamily[]) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const isDefault = COLOR_FAMILIES.every((f, i) => order[i] === f)
  const joined = (i: number): boolean =>
    perPage && i > 0 && pageGroupOf(order[i - 1]!) === pageGroupOf(order[i]!)
  return (
    <div className={s.root}>
      <span>Color order</span>
      <ol className={s.list} aria-label="Color order">
        {order.map((family, i) => (
          <li
            key={family}
            className={s.chip}
            draggable
            tabIndex={0}
            data-dragging={dragging === i || undefined}
            data-joined={joined(i) || undefined}
            aria-label={`${family}, ${i + 1} of ${order.length}${
              joined(i) ? `, same page as ${order[i - 1]}` : ''
            }`}
            onDragStart={() => setDragging(i)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging !== null && dragging !== i) onChange(move(order, dragging, i))
              setDragging(null)
            }}
            onKeyDown={(e) => {
              const to = i + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
              if (!e.altKey || to === i || to < 0 || to >= order.length) return
              e.preventDefault()
              onChange(move(order, i, to))
              // the same swatch, in its new place, keeps the focus
              requestAnimationFrame(() =>
                (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
              )
            }}
          >
            <i style={{ background: SWATCH[family] }} />
            {family}
          </li>
        ))}
      </ol>
      <button
        className="btn btn-quiet btn-sm"
        disabled={isDefault}
        onClick={() => onChange(DEFAULT_COLOR_ORDER)}
      >
        Reset
      </button>
      {perPage && (
        <span className={s.hint}>
          Joined colors share a page. Drag them apart to separate them.
        </span>
      )}
    </div>
  )
}
