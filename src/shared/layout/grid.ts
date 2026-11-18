import type { Device, Grid } from '../types'

// Fallbacks for when the phone doesn't report its grid. Per device class, easy to override here.
// iPad numbers are unconfirmed (see the plan's open questions) and get checked in M20.
const DEFAULT_GRIDS: Record<Device['deviceClass'], Grid> = {
  iPhone: { columns: 4, rows: 6, dockMax: 4 },
  iPad: { columns: 6, rows: 5, dockMax: 13 }
}

export function gridFor(deviceClass: Device['deviceClass'], reported?: Grid | null): Grid {
  return reported ?? DEFAULT_GRIDS[deviceClass]
}

export const pageCapacity = (grid: Grid): number => grid.columns * grid.rows
