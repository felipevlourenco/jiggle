import { useCallback, useState } from 'react'
import type { FolderItem, Layout } from '@shared/types'
import { Dock } from './Dock'
import { FolderPopover } from './FolderPopover'
import { PageDots } from './PageDots'
import { PageGrid } from './PageGrid'
import { frameSize, PhoneFrame, type FrameKind } from './PhoneFrame'
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
  udid,
  kind = 'iPhone',
  beforeKind = kind,
  beforeUdid = udid,
  beforeLabel = 'Before'
}: {
  before: Layout
  after: Layout
  moved: ReadonlySet<string>
  udid: string
  kind?: FrameKind
  // For a copy between devices the left side is another device: its own frame, icons and caption.
  beforeKind?: FrameKind
  beforeUdid?: string
  beforeLabel?: string
}) {
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<{ label: string; folder: FolderItem } | null>(null)
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
  const left = frameSize(beforeKind)
  const right = frameSize(kind)
  const zoom = size.height
    ? clamp(
        Math.min(
          (size.height - CAPTION) / Math.max(left.height, right.height),
          (size.width - GAP) / (left.width + right.width)
        ),
        0.15,
        1
      )
    : 0.5

  const side = (
    label: string,
    layout: Layout,
    frameKind: FrameKind,
    icons: string,
    marked?: ReadonlySet<string>
  ) => (
    <figure className={s.side} aria-label={label}>
      <figcaption>{label}</figcaption>
      <PhoneFrame zoom={zoom} kind={frameKind}>
        <PageGrid
          key={current}
          items={layout.pages[current] ?? []}
          grid={layout.grid}
          udid={icons}
          marked={marked}
          onFolder={(folder) => setOpen({ label, folder })}
        />
        <Dock items={layout.dock} udid={icons} />
        {open?.label === label && (
          <FolderPopover folder={open.folder} udid={icons} onClose={() => setOpen(null)} />
        )}
      </PhoneFrame>
    </figure>
  )

  return (
    <div className={s.root}>
      <div className={s.stage} ref={stageRef}>
        {side(beforeLabel, before, beforeKind, beforeUdid)}
        {side('After', after, kind, udid, moved)}
      </div>
      <div className={s.pager}>
        <button
          className={s.arrow}
          aria-label="Previous page"
          disabled={current === 0}
          onClick={() => (setOpen(null), setPage(current - 1))}
        >
          ‹
        </button>
        <PageDots count={count} current={current} onSelect={(n) => (setOpen(null), setPage(n))} />
        <button
          className={s.arrow}
          aria-label="Next page"
          disabled={current >= count - 1}
          onClick={() => (setOpen(null), setPage(current + 1))}
        >
          ›
        </button>
      </div>
    </div>
  )
}
