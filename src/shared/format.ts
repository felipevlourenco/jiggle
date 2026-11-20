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
