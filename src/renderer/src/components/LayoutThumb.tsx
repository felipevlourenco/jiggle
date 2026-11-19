import { useMemo } from 'react'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Grid, LayoutItem, SnapshotSummary } from '@shared/types'
import { PageGrid } from './PageGrid'
import { PhoneFrame, type FrameKind } from './PhoneFrame'

// A thumbnail's zoom: the iPad's landscape frame is about three times as wide as an iPhone's.
export const THUMB_ZOOM: Record<FrameKind, number> = { iPhone: 0.15, iPad: 0.07 }

// Page 1 of a layout as a small phone. Decoration: hidden from assistive tech, the text next to it says it all.
export function LayoutThumb({
  udid,
  items,
  grid,
  kind = 'iPhone',
  scale = 1
}: {
  udid: string
  items: LayoutItem[]
  grid: Grid
  kind?: FrameKind
  scale?: number // relative to the card size: the sheets show it larger
}) {
  return (
    <div aria-hidden="true">
      <PhoneFrame zoom={THUMB_ZOOM[kind] * scale} kind={kind}>
        <PageGrid items={items} grid={grid} udid={udid} />
      </PhoneFrame>
    </div>
  )
}

// A saved layout's page 1, from the raw items its summary carries.
export function SnapshotThumb({ snapshot, scale }: { snapshot: SnapshotSummary; scale?: number }) {
  const kind = snapshot.deviceClass ?? 'iPhone'
  const grid = gridFor(kind)
  const items = useMemo(
    () => normalize([[], snapshot.page1], grid).pages[0] ?? [],
    [snapshot.page1, grid]
  )
  return <LayoutThumb udid={snapshot.udid} items={items} grid={grid} kind={kind} scale={scale} />
}
