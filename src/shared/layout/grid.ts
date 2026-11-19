import type { Device, Grid } from '../types'

// Fallbacks for when the phone doesn't report its grid. Per device class, easy to override here.
// An iPad page is 6 × 5 = 30 icons in landscape. Its dock holds up to 13; the recent-apps area beside it
// isn't part of the icon state, so it is never touched.
// ponytail: iPad numbers are from memory, not a real iPad. Layouts use the grid the iPad itself reports
// (get_icon_metrics); this table is only the fallback.
const DEFAULT_GRIDS: Record<Device['deviceClass'], Grid> = {
  iPhone: { columns: 4, rows: 6, dockMax: 4 },
  iPad: { columns: 6, rows: 5, dockMax: 13 }
}

export function gridFor(deviceClass: Device['deviceClass'], reported?: Grid | null): Grid {
  return reported ?? DEFAULT_GRIDS[deviceClass]
}

export const pageCapacity = (grid: Grid): number => grid.columns * grid.rows
