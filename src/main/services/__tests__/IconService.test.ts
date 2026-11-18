import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DeviceBridge } from '../bridge/DeviceBridge'
import { IconService } from '../IconService'
import { iconsDir, resolveAssetUrl, wallpaperPath } from '../storage/paths'

const silent = { debug() {}, info() {}, warn() {}, error() {} }

function setup(wallpaper: Buffer | null = Buffer.from('WALL')) {
  const root = mkdtempSync(join(tmpdir(), 'jiggle-icons-'))
  const getIcons = vi.fn(async (_udid: string, ids: string[]) => {
    // the phone can't read this one
    return new Map(ids.filter((i) => i !== 'broken.app').map((i) => [i, Buffer.from('png-' + i)]))
  })
  const getWallpaper = vi.fn(async () => wallpaper)
  const bridge = { getIcons, getWallpaper } as unknown as DeviceBridge
  return { root, getIcons, getWallpaper, service: new IconService(bridge, root, silent) }
}

describe('IconService', () => {
  it('fetches missing icons in batches of 20 and writes one PNG each', async () => {
    const { service, root, getIcons } = setup()
    const ids = Array.from({ length: 45 }, (_, i) => `app.n${i}`)
    const result = await service.sync('U1', ids)
    expect(getIcons).toHaveBeenCalledTimes(3)
    expect(readdirSync(iconsDir(root, 'U1'))).toHaveLength(45)
    expect(readFileSync(join(iconsDir(root, 'U1'), 'app.n7.png'), 'utf8')).toBe('png-app.n7')
    expect(result.hasWallpaper).toBe(true)
  })

  it('does not ask the phone again for what is cached', async () => {
    const { service, getIcons, getWallpaper } = setup()
    await service.sync('U1', ['a.b', 'c.d'])
    getIcons.mockClear()
    getWallpaper.mockClear()
    await service.sync('U1', ['a.b', 'c.d'])
    expect(getIcons).not.toHaveBeenCalled()
    expect(getWallpaper).not.toHaveBeenCalled() // fresh enough
  })

  it('skips unreadable icons, unsafe ids and duplicates', async () => {
    const { service, root, getIcons } = setup()
    await service.sync('U1', ['ok.app', 'ok.app', 'broken.app', '../evil', 'a/b'])
    expect(getIcons).toHaveBeenCalledWith('U1', ['ok.app', 'broken.app'])
    expect(readdirSync(iconsDir(root, 'U1'))).toEqual(['ok.app.png'])
  })

  it('shares one run between concurrent calls for a device', async () => {
    const { service, getIcons } = setup()
    await Promise.all([service.sync('U1', ['a.b']), service.sync('U1', ['a.b'])])
    expect(getIcons).toHaveBeenCalledTimes(1)
  })

  it('reports no wallpaper when the phone has none (the UI shows a gradient)', async () => {
    const { service, root } = setup(null)
    expect((await service.sync('U1', ['a.b'])).hasWallpaper).toBe(false)
    expect(existsSync(wallpaperPath(root, 'U1'))).toBe(false)
  })
})

describe('resolveAssetUrl', () => {
  const root = '/data'
  it('maps icon and wallpaper URLs to cache files', () => {
    expect(resolveAssetUrl(root, 'jiggle-icon://icons/00008140-AB/com.spotify.client.png')).toBe(
      '/data/devices/00008140-AB/icons/com.spotify.client.png'
    )
    expect(resolveAssetUrl(root, 'jiggle-icon://icons/AB12/wallpaper.png')).toBe(
      '/data/devices/AB12/wallpaper.png'
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
