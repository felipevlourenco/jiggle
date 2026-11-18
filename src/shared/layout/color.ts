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

// Rainbow order: by hue band (red, orange, yellow, green, blue, purple, pink), light to dark inside a band;
// then the neutrals, light to dark. No color at all counts as neutral and a mid grey.
export function compareColors(a: IconColor | null, b: IconColor | null): number {
  const key = (c: IconColor | null): [number, number] => {
    if (!c || c.s < NEUTRAL_SATURATION) return [HUE_BANDS, -(c?.l ?? 0.5)]
    return [bandOf(c.h), -c.l]
  }
  const [ka, la] = key(a)
  const [kb, lb] = key(b)
  return ka - kb || la - lb
}
