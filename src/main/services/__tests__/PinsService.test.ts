import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PinsService } from '../PinsService'

const silent = { debug() {}, info() {}, warn() {}, error() {} }

describe('PinsService', () => {
  it('starts with no pins and remembers them per device', async () => {
    const pins = new PinsService(mkdtempSync(join(tmpdir(), 'jiggle-')), silent)
    expect(await pins.get('AB-12')).toEqual({ apps: [], page1: false })
    await pins.set('AB-12', { apps: ['com.x'], page1: true })
    expect(await pins.get('AB-12')).toEqual({ apps: ['com.x'], page1: true })
    expect(await pins.get('CD-34')).toEqual({ apps: [], page1: false })
  })

  it('falls back to no pins when the file is damaged', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jiggle-'))
    mkdirSync(join(root, 'devices', 'AB'), { recursive: true })
    writeFileSync(join(root, 'devices', 'AB', 'pins.json'), '{nope')
    expect(await new PinsService(root, silent).get('AB')).toEqual({ apps: [], page1: false })
  })

  it('refuses a udid that could leave the folder', async () => {
    await expect(new PinsService(tmpdir(), silent).get('../x')).rejects.toThrow()
  })
})
