import { describe, expect, it } from 'vitest'
import { appError, connectMessage } from '../errors'
import { isMod, osFrom, osText, type Os } from '../platform'

describe('osFrom', () => {
  it.each([
    ['darwin', 'mac'],
    ['MacIntel', 'mac'],
    ['win32', 'windows'],
    ['Win32', 'windows'],
    ['linux', 'linux'],
    ['Linux x86_64', 'linux']
  ])('%s is %s', (id, os) => expect(osFrom(id)).toBe(os))
})

describe('isMod', () => {
  const meta = { metaKey: true, ctrlKey: false }
  const ctrl = { metaKey: false, ctrlKey: true }

  it('is ⌘ on a Mac, where Ctrl keeps its system meaning', () => {
    expect([isMod(meta, 'mac'), isMod(ctrl, 'mac')]).toEqual([true, false])
  })

  it.each(['windows', 'linux'] as const)('is Ctrl on %s', (os) => {
    expect([isMod(ctrl, os), isMod(meta, os)]).toEqual([true, false])
  })
})

describe('wording', () => {
  it.each<[Os, string, string]>([
    ['mac', 'this Mac with a cable', '~/Library/Logs/Jiggle'],
    ['windows', 'this PC with a cable', '%APPDATA%\\Jiggle\\logs'],
    ['linux', 'this computer with a cable', '~/.config/Jiggle/logs']
  ])('on %s', (os, cable, logs) => {
    expect(connectMessage(undefined, false, os).body).toContain(cable)
    expect(appError('engine-failed', { os }).message).toContain(logs)
  })

  it('never says Mac, Finder or ⌘ anywhere else', () => {
    for (const os of ['windows', 'linux'] as const) {
      const text = [
        ...Object.values(osText(os)),
        connectMessage(undefined, true, os).body,
        appError('engine-failed', { os }).message
      ].join(' ')
      expect(text).not.toMatch(/Mac|Finder|⌘|⌥|Library/)
    }
  })
})
