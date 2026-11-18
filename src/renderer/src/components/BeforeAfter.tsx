import { useCallback, useState } from 'react'
import type { Layout } from '@shared/types'
import { Dock } from './Dock'
import { PageDots } from './PageDots'
import { PageGrid } from './PageGrid'
import { FRAME_HEIGHT, FRAME_WIDTH, PhoneFrame } from './PhoneFrame'
import s from './beforeAfter.module.css'

const GAP = 32
const CAPTION = 32 // the Before / After label above each frame
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// Two phones side by side with one pager: flipping a page flips both. The sides can have different
// page counts; a side that has run out of pages shows an empty one. `moved` gets a coral dot on After.
export function BeforeAfter({
  before,
  after,
  moved,
  udid
}: {
  before: Layout
  after: Layout
  moved: ReadonlySet<string>
  udid: string
}) {
  const [page, setPage] = useState(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const count = Math.max(before.pages.length, after.pages.length)
  const current = clamp(page, 0, Math.max(0, count - 1))

  // Fit both phones into the stage.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const zoom = size.height
    ? clamp(
        Math.min((size.height - CAPTION) / FRAME_HEIGHT, (size.width - GAP) / 2 / FRAME_WIDTH),
        0.3,
        1
      )
    : 0.5

  const side = (label: string, layout: Layout, marked?: ReadonlySet<string>) => (
    <figure className={s.side} aria-label={label}>
      <figcaption>{label}</figcaption>
      <PhoneFrame zoom={zoom}>
        <PageGrid
          key={current}
          items={layout.pages[current] ?? []}
          grid={layout.grid}
          udid={udid}
          marked={marked}
        />
        <Dock items={layout.dock} udid={udid} />
      </PhoneFrame>
    </figure>
  )

  return (
    <div className={s.root}>
      <div className={s.stage} ref={stageRef}>
        {side('Before', before)}
        {side('After', after, moved)}
      </div>
      <div className={s.pager}>
        <button
          className={s.arrow}
          aria-label="Previous page"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          ‹
        </button>
        <PageDots count={count} current={current} onSelect={setPage} />
        <button
          className={s.arrow}
          aria-label="Next page"
          disabled={current >= count - 1}
          onClick={() => setPage(current + 1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}
