import { useMemo } from 'react'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Grid, LayoutItem, SnapshotSummary } from '@shared/types'
import { PageGrid } from './PageGrid'
import { PhoneFrame } from './PhoneFrame'

// Page 1 of a layout as a small phone. Decoration: hidden from assistive tech, the text next to it says it all.
export function LayoutThumb({
  udid,
  items,
  grid,
  zoom = 0.15
}: {
  udid: string
  items: LayoutItem[]
  grid: Grid
  zoom?: number
}) {
  return (
    <div aria-hidden="true">
      <PhoneFrame zoom={zoom}>
        <PageGrid items={items} grid={grid} udid={udid} />
      </PhoneFrame>
    </div>
  )
}

// A saved layout's page 1, from the raw items its summary carries.
// ponytail: always the iPhone grid; M20 gives iPads their own.
export function SnapshotThumb({ snapshot, zoom }: { snapshot: SnapshotSummary; zoom?: number }) {
  const grid = gridFor('iPhone')
  const items = useMemo(
    () => normalize([[], snapshot.page1], grid).pages[0] ?? [],
    [snapshot.page1, grid]
  )
  return <LayoutThumb udid={snapshot.udid} items={items} grid={grid} zoom={zoom} />
}
