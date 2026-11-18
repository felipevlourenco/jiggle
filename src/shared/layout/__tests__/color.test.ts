import { describe, expect, it } from 'vitest'
import type { IconColor } from '../../types'
import { compareColors, dominantColor, rgbToHsl } from '../color'

const hsl = (h: number, s = 0.8, l = 0.5): IconColor => ({ h, s, l })

// a BGRA image from rows of [r, g, b] (or null for transparent)
function image(pixels: ([number, number, number] | null)[], width = pixels.length) {
  const data = new Uint8Array(pixels.length * 4)
  pixels.forEach((p, i) => data.set(p ? [p[2], p[1], p[0], 255] : [0, 0, 0, 0], i * 4))
  return { data, width, height: pixels.length / width }
}
const many = (n: number, p: [number, number, number]) => Array.from({ length: n }, () => p)

describe('compareColors', () => {
  it('orders red, orange, yellow, green, blue, purple, then white, grey, black', () => {
    const colors: Record<string, IconColor | null> = {
      black: hsl(0, 0, 0.05),
      blue: hsl(220),
      white: hsl(0, 0, 0.97),
      red: hsl(355), // red on the far side of 0° is still red
      grey: hsl(0, 0.02, 0.6),
      purple: hsl(280),
      green: hsl(120),
      orange: hsl(30),
      yellow: hsl(55),
      unknown: null
    }
    const sorted = Object.keys(colors).sort((a, b) => compareColors(colors[a]!, colors[b]!))
    expect(sorted).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'white',
      'grey',
      'unknown',
      'black'
    ])
  })

  it('goes light to dark inside a hue band and inside the neutrals', () => {
    expect(compareColors(hsl(220, 0.8, 0.7), hsl(220, 0.8, 0.3))).toBeLessThan(0)
    expect(compareColors(hsl(0, 0, 0.9), hsl(0, 0, 0.2))).toBeLessThan(0)
  })

  it('puts a barely colored icon with the neutrals, not the colors', () => {
    expect(compareColors(hsl(120, 0.1, 0.9), hsl(280, 0.8, 0.5))).toBeGreaterThan(0)
  })
})

describe('rgbToHsl', () => {
  it('converts primaries, white and black', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 1, l: 0.5 })
    expect(rgbToHsl(0, 0, 255).h).toBeCloseTo(240)
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 1 })
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 })
  })
})

describe('dominantColor', () => {
  it('is the biggest group of pixels', () => {
    const c = dominantColor(image([...many(60, [220, 30, 30]), ...many(40, [30, 30, 220])], 10))!
    expect(c.h).toBeLessThan(10)
    expect(c.s).toBeGreaterThan(0.5)
  })

  it('calls a mostly white icon with a small colored logo white', () => {
    const c = dominantColor(image([...many(80, [250, 250, 250]), ...many(20, [220, 30, 30])], 10))!
    expect(c.s).toBeLessThan(0.15)
    expect(c.l).toBeGreaterThan(0.9)
  })

  it('averages red across 0° instead of splitting it', () => {
    const c = dominantColor(image([...many(50, [255, 0, 20]), ...many(50, [255, 20, 0])], 10))!
    expect(c.h < 10 || c.h > 350).toBe(true)
  })

  it('ignores transparent pixels, and is null for an empty image', () => {
    const c = dominantColor(image([...many(10, [30, 200, 30]), ...Array(90).fill(null)], 10))!
    expect(c.h).toBeGreaterThan(100)
    expect(dominantColor(image(Array(4).fill(null), 2))).toBeNull()
  })
})
