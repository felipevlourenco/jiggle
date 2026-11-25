import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DeviceBridge } from '../bridge/DeviceBridge'
import { IconService } from '../IconService'
import { iconsDir, resolveAssetUrl } from '../storage/paths'

const silent = { debug() {}, info() {}, warn() {}, error() {} }

function setup(colorOf?: (png: Buffer) => { h: number; s: number; l: number } | null) {
  const root = mkdtempSync(join(tmpdir(), 'jiggle-icons-'))
  const getIcons = vi.fn(async (_udid: string, ids: string[]) => {
    // the phone can't read this one
    return new Map(ids.filter((i) => i !== 'broken.app').map((i) => [i, Buffer.from('png-' + i)]))
  })
  const bridge = { getIcons } as unknown as DeviceBridge
  return { root, getIcons, service: new IconService(bridge, root, silent, colorOf) }
}

describe('IconService', () => {
  it('fetches missing icons in batches of 20 and writes one PNG each', async () => {
    const { service, root, getIcons } = setup()
    const ids = Array.from({ length: 45 }, (_, i) => `app.n${i}`)
    await service.sync('U1', ids)
    expect(getIcons).toHaveBeenCalledTimes(3)
    expect(readdirSync(iconsDir(root, 'U1'))).toHaveLength(45)
    expect(readFileSync(join(iconsDir(root, 'U1'), 'app.n7.png'), 'utf8')).toBe('png-app.n7')
  })

  it('does not ask the phone again for what is cached', async () => {
    const { service, getIcons } = setup()
    await service.sync('U1', ['a.b', 'c.d'])
    getIcons.mockClear()
    await service.sync('U1', ['a.b', 'c.d'])
    expect(getIcons).not.toHaveBeenCalled()
  })

  it('skips unreadable icons, unsafe ids and duplicates', async () => {
    const { service, root, getIcons } = setup()
    await service.sync('U1', ['ok.app', 'ok.app', 'broken.app', '../evil', 'a/b'])
    expect(getIcons).toHaveBeenCalledWith('U1', ['ok.app', 'broken.app'])
    expect(readdirSync(iconsDir(root, 'U1'))).toEqual(['ok.app.png'])
  })

  it('does not refetch for concurrent calls, and still serves a call with different ids', async () => {
    const { service, root, getIcons } = setup()
    await Promise.all([
      service.sync('U1', ['a.b']),
      service.sync('U1', ['a.b']),
      service.sync('U1', ['c.d'])
    ])
    expect(getIcons).toHaveBeenCalledTimes(2) // a.b once, then c.d
    expect(readdirSync(iconsDir(root, 'U1')).sort()).toEqual(['a.b.png', 'c.d.png'])
  })
})

describe('IconService colors', () => {
  const red = { h: 0, s: 0.9, l: 0.5 }

  it("reads each icon's color once and remembers it, including icons that fail", async () => {
    const colorOf = vi.fn((png: Buffer) => {
      if (png.toString() === 'png-bad.app') throw new Error('not an image')
      return red
    })
    const { service, root } = setup(colorOf)
    await service.sync('U1', ['a.b', 'bad.app'])
    expect(await service.colors('U1')).toEqual({ 'a.b': red, 'bad.app': null })
    colorOf.mockClear()
    // a new service (a relaunch) answers from the file
    const again = new IconService(
      { getIcons: async () => new Map() } as unknown as DeviceBridge,
      root,
      silent,
      colorOf
    )
    await again.sync('U1', ['a.b', 'bad.app'])
    expect(colorOf).not.toHaveBeenCalled()
    expect(await again.colors('U1')).toEqual({ 'a.b': red, 'bad.app': null })
  })

  it('does nothing without a decoder and has no colors before a sync', async () => {
    const { service } = setup()
    expect(await service.colors('U1')).toEqual({})
    await service.sync('U1', ['a.b'])
    expect(await service.colors('U1')).toEqual({})
  })
})

describe('IconService.clear', () => {
  it('deletes cached icons and colors for every device, and nothing else', async () => {
    const { service, root } = setup(() => ({ h: 0, s: 1, l: 0.5 }))
    await service.sync('A1', ['a.b'])
    await service.sync('B2', ['c.d'])
    writeFileSync(join(root, 'devices', 'A1', 'snapshots.json'), 'keep me')
    await service.clear()
    expect(existsSync(iconsDir(root, 'A1'))).toBe(false)
    expect(existsSync(iconsDir(root, 'B2'))).toBe(false)
    expect(await service.colors('A1')).toEqual({})
    expect(readFileSync(join(root, 'devices', 'A1', 'snapshots.json'), 'utf8')).toBe('keep me')
  })
})

describe('resolveAssetUrl', () => {
  const root = '/data'
  it('maps icon URLs to cache files', () => {
    expect(resolveAssetUrl(root, 'jiggle-icon://icons/00008140-AB/com.spotify.client.png')).toBe(
      join(root, 'devices', '00008140-AB', 'icons', 'com.spotify.client.png')
    )
  })

  it.each([
    'jiggle-icon://other/AB12/a.png',
    'jiggle-icon://icons/AB12/../../etc/passwd.png',
    'jiggle-icon://icons/AB12/%2e%2e%2fsecret.png',
    'jiggle-icon://icons/AB12/a.txt',
    'jiggle-icon://icons/../a.png',
    'jiggle-icon://icons/AB12/a/b.png',
    'not a url'
  ])('rejects %s', (url) => {
    expect(resolveAssetUrl(root, url)).toBeNull()
  })
})
