import type { IconColor } from '../types'

// Below this saturation a color counts as neutral: white, grey or black.
export const NEUTRAL_SATURATION = 0.15
const HUE_BANDS = 12 // 30° each, red in the middle of band 0 so it doesn't split at 0°/360°

export function rgbToHsl(r: number, g: number, b: number): IconColor {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

const bandOf = (h: number): number => Math.floor((((h + 15) % 360) / 360) * HUE_BANDS)

// The color most of an icon is: the biggest group of similar pixels (a hue band, or "neutral").
// An icon that is mostly white with a small colored logo is white, like it looks.
// `data` is 4 bytes per pixel, B G R A (what Electron's nativeImage gives on macOS).
export function dominantColor(img: {
  data: Uint8Array
  width: number
  height: number
}): IconColor | null {
  const pixels = img.width * img.height
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 4096))) // ~4k samples is plenty
  const NEUTRAL = HUE_BANDS
  const groups = Array.from({ length: HUE_BANDS + 1 }, () => ({ n: 0, h: 0, s: 0, l: 0 }))
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4
      if (img.data[i + 3]! < 200) continue // transparent corners
      const c = rgbToHsl(img.data[i + 2]!, img.data[i + 1]!, img.data[i]!)
      const g = groups[c.s < NEUTRAL_SATURATION ? NEUTRAL : bandOf(c.h)]!
      g.n++
      g.h += (c.h + 15) % 360 // shifted, so red averages properly
      g.s += c.s
      g.l += c.l
    }
  }
  let best = 0
  groups.forEach((g, i) => {
    if (g.n > groups[best]!.n) best = i
  })
  const g = groups[best]!
  if (g.n === 0) return null
  return { h: best === NEUTRAL ? 0 : (g.h / g.n - 15 + 360) % 360, s: g.s / g.n, l: g.l / g.n }
}

export const COLOR_FAMILIES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'white',
  'grey',
  'black'
] as const
export type ColorFamily = (typeof COLOR_FAMILIES)[number]
// The rainbow, then white, grey, black.
export const DEFAULT_COLOR_ORDER: readonly ColorFamily[] = COLOR_FAMILIES

const BAND_FAMILY: ColorFamily[] = [
  'red', // 0: the 12 hue bands, 30° each
  'orange',
  'yellow', // 2: 45° to 75°
  'green', // 3: from 75° an icon looks lime, not yellow
  'green',
  'green',
  'teal',
  'blue',
  'blue',
  'purple',
  'purple',
  'pink'
]
// Which colors share their pages with One color per page is the person's choice: `joins` lists the colors
// that share a page with the one before them in the color order, so a run can be as long as they like.
// Until they choose, look-alikes that are neighbors are joined: an icon a few degrees (or shades) over a
// family's edge would otherwise get a page of its own.
const LOOKS_LIKE: Partial<Record<ColorFamily, ColorFamily>> = {
  yellow: 'orange',
  teal: 'green',
  pink: 'purple',
  grey: 'white'
}
export const defaultJoins = (order: readonly ColorFamily[]): ColorFamily[] =>
  order.filter(
    (f, i) => i > 0 && (LOOKS_LIKE[f] ?? f) === (LOOKS_LIKE[order[i - 1]!] ?? order[i - 1])
  )

// The first color of the run that shares its pages with `family`.
export function pageHeadOf(
  family: ColorFamily,
  order: readonly ColorFamily[],
  joins: readonly ColorFamily[]
): ColorFamily {
  let i = order.indexOf(family)
  if (i < 0) return family
  while (i > 0 && joins.includes(order[i]!)) i--
  return order[i]!
}

// Moves the color at `from` to `to`. The others stay in their runs. The moved color stays in its own run
// when it lands next to it, joins a run it is dropped inside, and anywhere else stands alone.
export function moveColor(
  order: readonly ColorFamily[],
  joins: readonly ColorFamily[],
  from: number,
  to: number
): { order: ColorFamily[]; joins: ColorFamily[] } {
  let runs = 0
  const run = new Map(order.map((f, i) => [f, i > 0 && joins.includes(f) ? runs : ++runs]))
  const next = [...order]
  const moved = next.splice(from, 1)[0]!
  next.splice(to, 0, moved)
  const before = run.get(next[to - 1]!)
  const after = run.get(next[to + 1]!)
  const own = run.get(moved)
  if (before !== own && after !== own) {
    run.set(moved, before !== undefined && before === after ? before : 0)
  }
  return {
    order: next,
    joins: next.filter((f, i) => i > 0 && run.get(f) === run.get(next[i - 1]!))
  }
}

// ponytail: white and black are cut at fixed lightness (0.85, 0.25); tune if icons land on the wrong side.
export function familyOf(c: IconColor | null): ColorFamily {
  if (!c) return 'grey' // no color known: a mid grey
  if (c.chosen) return c.chosen
  if (c.s < NEUTRAL_SATURATION) return c.l >= 0.85 ? 'white' : c.l <= 0.25 ? 'black' : 'grey'
  return BAND_FAMILY[bandOf(c.h)]!
}

// Order by family (the person's order, or the rainbow), then by hue band, light to dark inside a band.
// The neutrals are light to dark inside their family. A family missing from `order` goes after the listed ones, in the default order.
export function compareColors(
  a: IconColor | null,
  b: IconColor | null,
  order: readonly ColorFamily[] = DEFAULT_COLOR_ORDER
): number {
  const key = (c: IconColor | null): [number, number, number] => {
    const f = familyOf(c)
    const rank = order.indexOf(f)
    const family = rank < 0 ? order.length + COLOR_FAMILIES.indexOf(f) : rank
    // A color the person chose has no shade to place it by: it follows the icons that were read.
    if (c?.chosen) return [family, HUE_BANDS, 0]
    if (!c || c.s < NEUTRAL_SATURATION) return [family, 0, -(c?.l ?? 0.5)]
    return [family, bandOf(c.h), -c.l]
  }
  const [fa, ba, la] = key(a)
  const [fb, bb, lb] = key(b)
  return fa - fb || ba - bb || la - lb
}
