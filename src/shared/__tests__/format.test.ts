import { describe, expect, it } from 'vitest'
import { formatBytes } from '../format'

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
