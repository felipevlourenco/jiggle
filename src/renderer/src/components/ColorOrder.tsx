import { useState } from 'react'
import {
  COLOR_FAMILIES,
  DEFAULT_COLOR_ORDER,
  defaultJoins,
  moveColor,
  type ColorFamily
} from '@shared/layout/color'
import s from './colorOrder.module.css'

export const SWATCH: Record<ColorFamily, string> = {
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

// The color families in the order the sort will use. Drag a swatch to move it, or focus one and press
// Alt + ← / →. With one color per page, the + and − buttons choose which neighbors share a page.
export function ColorOrder({
  order,
  joins,
  perPage = false,
  onChange
}: {
  order: readonly ColorFamily[]
  joins: readonly ColorFamily[] // colors sharing a page with the one before them
  perPage?: boolean
  onChange: (order: readonly ColorFamily[], joins: readonly ColorFamily[]) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const standard = defaultJoins(DEFAULT_COLOR_ORDER)
  const isDefault =
    COLOR_FAMILIES.every((f, i) => order[i] === f) &&
    joins.length === standard.length &&
    standard.every((f) => joins.includes(f))
  const joined = (i: number): boolean => perPage && i > 0 && joins.includes(order[i]!)
  const move = (from: number, to: number): void => {
    const next = moveColor(order, joins, from, to)
    onChange(next.order, next.joins)
  }
  const toggle = (family: ColorFamily): void =>
    onChange(order, joins.includes(family) ? joins.filter((f) => f !== family) : [...joins, family])
  const reset = (
    <button
      className="btn btn-quiet btn-sm"
      disabled={isDefault}
      onClick={() => onChange(DEFAULT_COLOR_ORDER, standard)}
    >
      Reset
    </button>
  )
  return (
    <div className={s.root}>
      <span>Color order</span>
      <ol className={s.list} aria-label="Color order" data-links={perPage || undefined}>
        {order.map((family, i) => (
          <li
            key={family}
            className={s.item}
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
              if (dragging !== null && dragging !== i) move(dragging, i)
              setDragging(null)
            }}
            onKeyDown={(e) => {
              const to = i + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
              if (!e.altKey || to === i || to < 0 || to >= order.length) return
              e.preventDefault()
              const list = e.currentTarget.parentElement
              move(i, to)
              // the same swatch, in its new place, keeps the focus
              requestAnimationFrame(() => (list?.children[to] as HTMLElement | undefined)?.focus())
            }}
          >
            {perPage && i > 0 && (
              <button
                type="button"
                className={s.link}
                aria-label={`Same page: ${order[i - 1]} and ${family}`}
                aria-pressed={joined(i)}
                title={
                  joined(i)
                    ? `Start a new page at ${family}`
                    : `Put ${family} on the same page as ${order[i - 1]}`
                }
                onClick={() => toggle(family)}
              >
                {joined(i) ? '−' : '+'}
              </button>
            )}
            <span className={s.chip}>
              <i style={{ background: SWATCH[family] }} />
              {family}
            </span>
          </li>
        ))}
      </ol>
      {perPage ? (
        // The + and − buttons leave no room beside the swatches: Reset goes with the help.
        <div className={s.foot}>
          <span className={s.hint}>
            Colors linked by − share a page. Click + to link two neighbors, as many as you like.
            Drag a color to move it.
          </span>
          {reset}
        </div>
      ) : (
        reset
      )}
    </div>
  )
}
