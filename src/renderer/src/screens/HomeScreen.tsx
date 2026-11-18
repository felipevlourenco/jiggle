import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react'
import { summarize } from '@shared/layout/summarize'
import type { Device } from '@shared/types'
import { Dock } from '../components/Dock'
import { PageDots } from '../components/PageDots'
import { PageGrid } from '../components/PageGrid'
import { FRAME_HEIGHT, PhoneFrame } from '../components/PhoneFrame'
import t from '../components/tiles.module.css'
import p from '../components/phone.module.css'
import { useLayout } from '../state/queries'
import s from './home.module.css'

const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.2
const SWIPE_DISTANCE = 60 // trackpad pixels before a swipe turns the page
const SWIPE_PAUSE_MS = 120 // a swipe ends when the wheel events stop (inertia included)

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function HomeScreen({ device }: { device: Device }) {
  const { data, isPending, isError, refetch, isRefetching } = useLayout(device.udid)
  const [page, setPage] = useState(0)
  const [chosenZoom, setChosenZoom] = useState<number>()
  const [stageHeight, setStageHeight] = useState(0)

  const pageCount = data?.layout.pages.length ?? 0
  const current = clamp(page, 0, Math.max(0, pageCount - 1))
  const goTo = useCallback(
    (to: number) => setPage(clamp(to, 0, Math.max(0, pageCount - 1))),
    [pageCount]
  )

  // Fit the phone into the window until the user picks a zoom of their own.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() => setStageHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const fit = stageHeight ? clamp((stageHeight - 8) / FRAME_HEIGHT, MIN_ZOOM, 1) : 0.7
  const zoom = chosenZoom ?? fit

  // ⌘← / ⌘→
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey) return
      if (e.key === 'ArrowLeft') goTo(current - 1)
      else if (e.key === 'ArrowRight') goTo(current + 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, goTo])

  // Two-finger trackpad swipe: one page per swipe, re-armed once the wheel events stop.
  const swipe = useRef({ distance: 0, armed: true, timer: 0 })
  const onWheel = (e: WheelEvent): void => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    const st = swipe.current
    window.clearTimeout(st.timer)
    st.timer = window.setTimeout(() => ((st.armed = true), (st.distance = 0)), SWIPE_PAUSE_MS)
    if (!st.armed) return
    st.distance += e.deltaX
    if (Math.abs(st.distance) < SWIPE_DISTANCE) return
    goTo(current + Math.sign(st.distance))
    st.armed = false
    st.distance = 0
  }

  if (isError) {
    return (
      <div className={s.root}>
        <div className={s.message} role="alert">
          <h2>Couldn’t read the home screen</h2>
          <p>Make sure your {device.deviceClass} is unlocked and connected.</p>
          <button
            className="btn btn-primary"
            disabled={isRefetching}
            onClick={() => void refetch()}
          >
            {isRefetching ? 'Trying…' : 'Try Again'}
          </button>
        </div>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className={s.root}>
        <p className={s.status} role="status">
          Reading your home screen…
        </p>
        <div className={s.stage} ref={stageRef}>
          <PhoneFrame zoom={zoom}>
            <div className={p.grid}>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className={t.cell}>
                  <div className={t.skeleton} />
                </div>
              ))}
            </div>
          </PhoneFrame>
        </div>
      </div>
    )
  }

  const { layout } = data
  const summary = summarize(layout)
  if (layout.pages.length === 0 && layout.dock.length === 0) {
    return (
      <div className={s.root}>
        <div className={s.message}>
          <h2>This home screen is empty</h2>
          <p>Your apps live in the App Library.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <p className={s.strip}>
        {plural(summary.apps, 'app')} · {plural(summary.pages, 'page')} ·{' '}
        {plural(summary.widgets, 'widget')}
      </p>

      <div className={s.stage} ref={stageRef} onWheel={onWheel}>
        <PhoneFrame zoom={zoom}>
          <PageGrid
            key={current}
            items={layout.pages[current] ?? []}
            grid={layout.grid}
            udid={device.udid}
          />
          <Dock items={layout.dock} udid={device.udid} />
        </PhoneFrame>
      </div>

      <div className={s.controls}>
        <span />
        <div className={s.pager}>
          <button
            className={s.arrow}
            aria-label="Previous page"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            ‹
          </button>
          <PageDots count={pageCount} current={current} onSelect={goTo} />
          <button
            className={s.arrow}
            aria-label="Next page"
            disabled={current >= pageCount - 1}
            onClick={() => goTo(current + 1)}
          >
            ›
          </button>
        </div>
        <label className={s.zoom}>
          Zoom
          <input
            type="range"
            min={Math.round(MIN_ZOOM * 100)}
            max={Math.round(MAX_ZOOM * 100)}
            value={Math.round(zoom * 100)}
            onChange={(e) => setChosenZoom(Number(e.target.value) / 100)}
          />
        </label>
      </div>
    </div>
  )
}
