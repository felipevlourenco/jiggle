import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ColorOverrideService } from '../ColorOverrideService'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const dir = () => mkdtempSync(join(tmpdir(), 'jiggle-colors-'))
const read = { h: 30, s: 1, l: 0.5 }

describe('ColorOverrideService', () => {
  it('lays the chosen color over the one read from the icon, and keeps it after a relaunch', async () => {
    const root = dir()
    const service = new ColorOverrideService(root, silent)
    expect(service.apply('a', read)).toBe(read)
    await service.set('a', 'Maps', 'blue')
    const relaunched = new ColorOverrideService(root, silent)
    expect(relaunched.apply('a', read)).toEqual({ ...read, chosen: 'blue' })
    expect(relaunched.apply('a', null)).toMatchObject({ chosen: 'blue' })
    expect(relaunched.apply('b', null)).toBeNull()
  })

  it('lists by name, and null puts the reading back', async () => {
    const service = new ColorOverrideService(dir(), silent)
    await service.set('z', 'Zoom', 'red')
    await service.set('a', 'Maps', 'blue')
    expect(service.list().map((o) => o.name)).toEqual(['Maps', 'Zoom'])
    await service.set('a', 'Maps', null)
    expect(service.list()).toEqual([{ bundleId: 'z', name: 'Zoom', color: 'red' }])
    expect(service.apply('a', read)).toBe(read)
  })

  it('tells the app only once the change is on disk', async () => {
    const root = dir()
    const onChange = vi.fn(() =>
      expect(readFileSync(join(root, 'color-overrides.json'), 'utf8')).toContain('blue')
    )
    await new ColorOverrideService(root, silent, onChange).set('a', 'Maps', 'blue')
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('a damaged file means no choices, and one bad entry doesn’t drop the others', () => {
    const root = dir()
    writeFileSync(join(root, 'color-overrides.json'), '{ nope')
    expect(new ColorOverrideService(root, silent).list()).toEqual([])
    writeFileSync(
      join(root, 'color-overrides.json'),
      JSON.stringify({ a: { name: 'Maps', color: 'blue' }, b: { name: 'Zoom', color: 'beige' } })
    )
    expect(new ColorOverrideService(root, silent).list().map((o) => o.bundleId)).toEqual(['a'])
  })
})
