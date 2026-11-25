import { describe, expect, it } from 'vitest'
import { formatBytes, selectionSummary } from '../format'

describe('formatBytes', () => {
  it('uses decimal units, one decimal under 100 and none above', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1000)).toBe('1 KB')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(8_500_000)).toBe('8.5 MB')
    expect(formatBytes(420_000_000)).toBe('420 MB')
    expect(formatBytes(1_230_000_000)).toBe('1.2 GB')
    expect(formatBytes(2_000_000_000_000)).toBe('2 TB')
  })
})

describe('selectionSummary', () => {
  it('totals the selected apps', () => {
    expect(selectionSummary([1_200_000_000, 800_000_000])).toBe('2 selected · 2 GB')
  })

  it('leaves unknown sizes out of the total, and says how many', () => {
    expect(selectionSummary([500_000_000, null, undefined])).toBe(
      '3 selected · 500 MB (2 without a size)'
    )
  })

  it('shows a dash when no selected app has a size, but counts a real zero', () => {
    expect(selectionSummary([null])).toBe('1 selected · –')
    expect(selectionSummary([0])).toBe('1 selected · 0 B')
  })
})
