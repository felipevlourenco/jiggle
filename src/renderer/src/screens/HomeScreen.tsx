import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyEvent,
  type WheelEvent
} from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { compact, renameFolder } from '@shared/layout/edit'
import { gridFor, pageCapacity } from '@shared/layout/grid'
import { findApps, type AppMatch } from '@shared/layout/search'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { summarize } from '@shared/layout/summarize'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { Device, FolderItem, Layout } from '@shared/types'
import { Dock } from '../components/Dock'
import { EditorDnd, FlipZones, FolderPanel } from '../components/Editor'
import { FolderPopover } from '../components/FolderPopover'
import { PageDots } from '../components/PageDots'
import { PageGrid } from '../components/PageGrid'
import { ToolbarActions } from '../components/ToolbarSlot'
import { RedoIcon, UndoIcon, PencilIcon, SearchIcon } from '../components/icons'
import { frameSize, PhoneFrame } from '../components/PhoneFrame'
import t from '../components/tiles.module.css'
import p from '../components/phone.module.css'
import { draftActions, useDraft } from '../state/draft'
import { useLayout } from '../state/queries'
import { ApplySheet } from '../sheets/Apply'
import s from './home.module.css'

const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.2
const SWIPE_DISTANCE = 60 // trackpad pixels before a swipe turns the page
const SWIPE_PAUSE_MS = 120 // a swipe ends when the wheel events stop (inertia included)

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function HomeScreen({ device, onExport }: { device: Device; onExport: () => void }) {
  const navigate = useNavigate()
  const { data, isPending, isError, refetch, isRefetching } = useLayout(device.udid)
  const [page, setPage] = useState(0)
  const [chosenZoom, setChosenZoom] = useState<number>()
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [preview, setPreview] = useState<Layout | null>(null) // see EditorDnd
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState(0) // which match of the search is shown
  const searchBox = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()
  const editor = useDraft()
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  // What is being pushed, kept apart from the draft: a successful push resets the draft while the sheet
  // is still showing "Done".
  const [pushing, setPushing] = useState<{
    changes: number
    beforeSignature: string
    after: Layout
  } | null>(null)
  // The draft belongs to one phone and to the layout it started from.
  const mine = editor.draft && editor.udid === device.udid ? editor.draft : null
  const editing = !!mine && editor.editing
  const shown = mine?.present ?? data?.layout

  const pageCount = shown?.pages.length ?? 0
  const current = clamp(page, 0, Math.max(0, pageCount - 1))
  const goTo = useCallback(
    (to: number) => setPage(clamp(to, 0, Math.max(0, pageCount - 1))),
    [pageCount]
  )

  // Fit the phone into the window until the user picks a zoom of their own.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() =>
      setStage({ width: el.clientWidth, height: el.clientHeight })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const frame = frameSize(device.deviceClass)
  const fit = stage.height
    ? clamp(
        Math.min((stage.height - 8) / frame.height, (stage.width - 8) / frame.width),
        MIN_ZOOM,
        1
      )
    : 0.7
  const zoom = chosenZoom ?? fit

  // A draft for another phone, or for a layout the phone no longer has (it changed, or a push went through).
  const baseSignature = mine ? layoutSignature(serialize(mine.base)) : null
  const phoneSignature = data ? layoutSignature(serialize(data.layout)) : null
  useEffect(() => {
    if (editor.draft && editor.udid !== device.udid) draftActions.reset()
    else if (baseSignature && phoneSignature && baseSignature !== phoneSignature)
      draftActions.reset()
  }, [editor.draft, editor.udid, device.udid, baseSignature, phoneSignature])

  // Search: the page with the match turns up, and a folder that holds it opens.
  const matches = useMemo(() => (shown ? findApps(shown, query) : []), [shown, query])
  const jumpTo = (match: AppMatch | undefined): void => {
    if (!match) return setOpenFolder(null)
    if (match.page !== null) setPage(match.page)
    setOpenFolder(match.folderId)
  }
  const search = (text: string): void => {
    setQuery(text)
    setHit(0)
    jumpTo(shown ? findApps(shown, text)[0] : undefined)
  }
  const onSearchKey = (e: ReactKeyEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') return search('')
    if (e.key !== 'Enter' || matches.length === 0) return
    const next = (hit + (e.shiftKey ? -1 : 1) + matches.length) % matches.length
    setHit(next)
    jumpTo(matches[next])
  }
  const found = matches[hit]

  // ⌘F
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.key.toLowerCase() !== 'f') return
      e.preventDefault()
      searchBox.current?.focus()
      searchBox.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ⌘Z / ⇧⌘Z
  useEffect(() => {
    if (!mine) return
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.key.toLowerCase() !== 'z') return
      if ((e.target as HTMLElement).closest('input, textarea')) return
      e.preventDefault()
      if (e.shiftKey) draftActions.redo()
      else draftActions.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mine])

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
          <PhoneFrame zoom={zoom} kind={device.deviceClass}>
            <div
              className={p.grid}
              style={{ gridTemplateColumns: `repeat(${gridFor(device.deviceClass).columns}, 1fr)` }}
            >
              {Array.from({ length: pageCapacity(gridFor(device.deviceClass)) }, (_, i) => (
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

  const layout = shown!
  const view = preview ?? layout // while dragging: the layout with the dragged icon in its new place
  const summary = summarize(layout)
  if (layout.pages.length === 0 && layout.dock.length === 0) {
    return (
      <div className={s.root}>
        <div className={s.message}>
          <h2>This home screen is empty</h2>
          <p>Your apps live in the App Library. Sort them back with Organize.</p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/organize')}>
            Open Organize
          </button>
        </div>
      </div>
    )
  }

  const folder = openFolder
    ? ([...view.dock, ...view.pages.flat()].find(
        (i) => i.id === openFolder && i.kind === 'folder'
      ) as FolderItem | undefined)
    : undefined
  const changes = mine?.past.length ?? 0
  const issues = mine ? validateLayout(mine.base, compact(mine.present)) : []
  const canEdit = device.state === 'ready'

  return (
    <div className={s.root}>
      <ToolbarActions>
        <label className={s.search}>
          <SearchIcon size={14} />
          <input
            ref={searchBox}
            type="search"
            placeholder="Find an app"
            aria-label="Find an app"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={onSearchKey}
          />
          {query && (
            <span className="meta" aria-live="polite">
              {matches.length ? `${hit + 1} of ${matches.length}` : 'No match'}
            </span>
          )}
        </label>
        {mine && changes > 0 && (
          <>
            <span className="pill" role="status">
              <i />
              {editing ? 'Editing · ' : ''}
              {plural(changes, 'change')}
            </span>
            <span className="vsep" />
          </>
        )}
        <button
          className={`tbtn${editing ? ' on' : ''}`}
          disabled={!canEdit}
          title={canEdit ? undefined : 'Editing is turned off for this iOS version'}
          onClick={() =>
            editing ? draftActions.done() : draftActions.edit(device.udid, data!.layout)
          }
        >
          <PencilIcon size={15} />
          {editing ? 'Done' : 'Edit'}
        </button>
        {mine && (
          <>
            <button
              className="tbtn"
              aria-label="Undo"
              disabled={mine.past.length === 0}
              onClick={draftActions.undo}
            >
              <UndoIcon size={15} />
            </button>
            <button
              className="tbtn"
              aria-label="Redo"
              disabled={mine.future.length === 0}
              onClick={draftActions.redo}
            >
              <RedoIcon size={15} />
            </button>
          </>
        )}
        <button className="tbtn" onClick={onExport}>
          Export
        </button>
        {mine && changes > 0 && (
          <>
            <button className="btn btn-quiet" onClick={draftActions.reset}>
              Discard
            </button>
            <button
              className="btn btn-primary"
              disabled={issues.length > 0}
              title={issues.length > 0 ? issues.map(describeIssue).join('; ') : undefined}
              onClick={() =>
                setPushing({
                  changes,
                  beforeSignature: layoutSignature(serialize(mine.base)),
                  after: compact(mine.present)
                })
              }
            >
              Push to {device.deviceClass}
            </button>
          </>
        )}
      </ToolbarActions>
      {pushing && (
        <ApplySheet
          title={`Push ${plural(pushing.changes, 'change')} to ${device.name}?`}
          lines={[plural(pushing.changes, 'manual change')]}
          doneMessage={`Done! ${device.name} matches your edits.`}
          udid={device.udid}
          run={() =>
            window.jiggle.apply.run({
              udid: device.udid,
              reason: 'Manual edit',
              beforeSignature: pushing.beforeSignature,
              after: pushing.after,
              removedFromHomeScreen: []
            })
          }
          onRefresh={() => {
            draftActions.reset()
            void qc.invalidateQueries({ queryKey: ['layout'] })
          }}
          onClose={() => setPushing(null)}
        />
      )}
      <p className={s.strip}>
        {plural(summary.apps, 'app')} · {plural(summary.pages, 'page')} ·{' '}
        {plural(summary.widgets, 'widget')}
        {editing && ' · Hold ⌥ and drop an app on another to make a folder'}
      </p>

      <EditorDnd
        layout={layout}
        zoom={zoom}
        udid={device.udid}
        onChange={draftActions.change}
        onPreview={setPreview}
        onFlip={(dir) => goTo(current + dir)}
        onDone={(keep) => keep || setOpenFolder(null)}
      >
        <div className={s.stage} ref={stageRef} onWheel={onWheel}>
          <PhoneFrame zoom={zoom} kind={device.deviceClass}>
            <PageGrid
              key={current}
              items={view.pages[current] ?? []}
              grid={layout.grid}
              udid={device.udid}
              found={found?.id}
              edit={editing ? { page: current, onOpenFolder: setOpenFolder } : undefined}
            />
            <Dock items={view.dock} udid={device.udid} edit={editing} found={found?.id} />
            {editing && <FlipZones />}
            {editing && folder && (
              <FolderPanel
                folder={folder}
                udid={device.udid}
                onRename={(name) => {
                  const next = renameFolder(layout, folder.id, name)
                  if (next) draftActions.change(next)
                }}
                onClose={() => setOpenFolder(null)}
              />
            )}
            {!editing && folder && (
              <FolderPopover
                folder={folder}
                udid={device.udid}
                found={found?.id}
                onClose={() => setOpenFolder(null)}
              />
            )}
          </PhoneFrame>
        </div>
      </EditorDnd>

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
