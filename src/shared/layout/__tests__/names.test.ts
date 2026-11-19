import { describe, expect, it } from 'vitest'
import { checkLayoutName, NAME_MAX } from '../names'

describe('checkLayoutName', () => {
  it('accepts a plain name, trimmed', () => {
    expect(checkLayoutName('  Work ', ['Weekend'])).toBeNull()
  })

  it('asks for a name when it is empty or blank', () => {
    expect(checkLayoutName('', [])).toMatch(/name/)
    expect(checkLayoutName('   ', [])).toMatch(/name/)
  })

  it('refuses a name another layout has, ignoring case, accents and spaces around it', () => {
    expect(checkLayoutName('work', ['Work'])).toBe('A layout named “work” already exists.')
    expect(checkLayoutName('Café', ['cafe '])).toMatch(/already exists/)
  })

  it('refuses a name that is too long', () => {
    expect(checkLayoutName('x'.repeat(NAME_MAX), [])).toBeNull()
    expect(checkLayoutName('x'.repeat(NAME_MAX + 1), [])).toMatch(/\d+ characters/)
  })
})
