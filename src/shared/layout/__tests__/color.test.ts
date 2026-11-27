import { describe, expect, it } from 'vitest'
import type { IconColor } from '../../types'
import {
  compareColors,
  DEFAULT_COLOR_ORDER,
  defaultJoins,
  dominantColor,
  familyOf,
  moveColor,
  pageHeadOf,
  rgbToHsl
} from '../color'

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

  it('lets a chosen color win, after the icons of that family that were read', () => {
    const chosen: IconColor = { ...hsl(30), chosen: 'blue' }
    expect(familyOf(chosen)).toBe('blue')
    expect(compareColors(hsl(250, 0.8, 0.2), chosen)).toBeLessThan(0)
    expect(compareColors(chosen, hsl(280))).toBeLessThan(0) // still before purple
    // the neutrals too, and two chosen ones are a tie (their names then decide)
    expect(compareColors(hsl(0, 0, 0.05), { ...hsl(30), chosen: 'black' })).toBeLessThan(0)
    expect(compareColors(chosen, { ...hsl(120), chosen: 'blue' })).toBe(0)
  })

  it('calls lime green green, not yellow', () => {
    expect(familyOf(hsl(100))).toBe('green')
    expect(familyOf(hsl(60))).toBe('yellow')
  })

  it('goes light to dark inside a hue band and inside the neutrals', () => {
    expect(compareColors(hsl(220, 0.8, 0.7), hsl(220, 0.8, 0.3))).toBeLessThan(0)
    expect(compareColors(hsl(0, 0, 0.9), hsl(0, 0, 0.2))).toBeLessThan(0)
  })

  it('puts a barely colored icon with the neutrals, not the colors', () => {
    expect(compareColors(hsl(120, 0.1, 0.9), hsl(280, 0.8, 0.5))).toBeGreaterThan(0)
  })
})

describe('colors sharing a page', () => {
  const order = ['red', 'orange', 'yellow', 'green', 'teal', 'blue'] as const

  it('starts with the look-alike neighbors joined', () => {
    expect(defaultJoins(DEFAULT_COLOR_ORDER)).toEqual(['yellow', 'teal', 'pink', 'grey'])
    expect(defaultJoins(['green', 'blue', 'teal'])).toEqual([])
  })

  it('makes runs as long as the person likes', () => {
    const joins = ['orange', 'yellow', 'green', 'teal'] as const
    expect(order.map((f) => pageHeadOf(f, order, joins))).toEqual([
      'red',
      'red',
      'red',
      'red',
      'red',
      'blue'
    ])
  })

  // red+orange+yellow, then green+teal, then blue
  const joins = ['orange', 'yellow', 'teal'] as const
  const runsAfter = (from: number, to: number): string => {
    const moved = moveColor(order, joins, from, to)
    return moved.order
      .map((f, i) => (i === 0 ? f : `${moved.joins.includes(f) ? '+' : ' '}${f}`))
      .join('')
  }

  it('keeps a color in its run when it moves inside it', () => {
    expect(runsAfter(0, 2)).toBe('orange+yellow+red green+teal blue')
    expect(runsAfter(2, 0)).toBe('yellow+red+orange green+teal blue')
  })

  it('takes a color out of its run, and the others stay together', () => {
    expect(runsAfter(1, 5)).toBe('red+yellow green+teal blue orange')
    expect(runsAfter(0, 5)).toBe('orange+yellow green+teal blue red') // the first of a run too
  })

  it('joins a color dropped inside a run, and leaves one at its edge alone', () => {
    expect(runsAfter(5, 1)).toBe('red+blue+orange+yellow green+teal')
    expect(runsAfter(5, 3)).toBe('red+orange+yellow blue green+teal')
    expect(runsAfter(5, 0)).toBe('blue red+orange+yellow green+teal')
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

describe('compareColors with a custom order', () => {
  const colors: Record<string, IconColor | null> = {
    black: hsl(0, 0, 0.05),
    blue: hsl(220),
    blue2: hsl(240), // another blue band: still blue, after the first
    green: hsl(120),
    red: hsl(0),
    white: hsl(0, 0, 0.97),
    unknown: null
  }
  const sort = (order: Parameters<typeof compareColors>[2]) =>
    Object.keys(colors).sort((a, b) => compareColors(colors[a]!, colors[b]!, order))

  it('puts the families in the person’s order, then anything left out last', () => {
    expect(sort(['blue', 'green', 'black'])).toEqual([
      'blue',
      'blue2',
      'green',
      'black',
      'red', // not in the list: after the listed ones, in the default order
      'white',
      'unknown'
    ])
  })

  it('the default order is the rainbow, then white, grey, black', () => {
    expect(sort(undefined)).toEqual(['red', 'green', 'blue', 'blue2', 'white', 'unknown', 'black'])
  })
})
