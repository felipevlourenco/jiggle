// Bytes the way macOS and iOS show storage: decimal units ("1.2 GB").
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  // one decimal under 100, none above: "8.5 MB", "420 MB"
  return `${value < 100 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`
}

// "3 selected · 4.2 GB": the total of the sizes the phone gave. Apps without one are left out, and counted, so
// the total doesn't pass for the whole selection. "–" when none has one.
export function selectionSummary(sizes: readonly (number | null | undefined)[]): string {
  const known = sizes.filter((n): n is number => n != null)
  const left = sizes.length - known.length
  const total = known.length ? formatBytes(known.reduce((sum, n) => sum + n, 0)) : '–'
  const note = known.length && left ? ` (${left} without a size)` : ''
  return `${sizes.length} selected · ${total}${note}`
}
