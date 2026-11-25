import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedEngine, venvPython } from '../enginePath'

describe('engine path', () => {
  it.each([
    ['darwin', 'jiggle_engine'],
    ['linux', 'jiggle_engine'],
    ['win32', 'jiggle_engine.exe']
  ])('packaged on %s', (platform, file) => {
    expect(packagedEngine('res', platform)).toBe(join('res', 'sidecar', 'jiggle_engine', file))
  })

  it.each([
    ['darwin', '.venv/bin/python'],
    ['linux', '.venv/bin/python'],
    ['win32', '.venv/Scripts/python.exe']
  ])('dev on %s', (platform, python) => {
    expect(venvPython('sidecar', platform)).toBe(join('sidecar', python))
  })
})
