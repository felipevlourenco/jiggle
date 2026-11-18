import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AppsResult } from '@shared/types'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { MockBridge, loadFixture } from '../../services/bridge/MockBridge'
import { CategoryService } from '../../services/CategoryService'
import { IconService } from '../../services/IconService'
import { registerIpc } from '..'
import type { IpcLike } from '../handle'

const fixture = loadFixture(join(__dirname, '../../../../tests/fixtures'), 'iphone-basic')

// A fake ipcMain: remembers handlers so tests can call them like the renderer would.
function setup() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ipc: IpcLike = { handle: (ch, fn) => void handlers.set(ch, (...a) => fn({}, ...a)) }
  const broadcast = vi.fn()
  const bridge = new MockBridge(fixture)
  const silent = { debug() {}, info() {}, warn() {}, error() {} }
  const root = mkdtempSync(join(tmpdir(), 'jiggle-'))
  const icons = new IconService(bridge, root, silent)
  // Offline: lookups fail at once, so every non-Apple app stays "Unknown".
  const failing = vi.fn(async () => {
    throw new TypeError('offline')
  }) as unknown as typeof fetch
  const categories = new CategoryService({
    root,
    storefront: 'nl',
    log: silent,
    onChange() {},
    fetch: failing,
    sleep: async () => {}
  })
  registerIpc(ipc, bridge, broadcast, icons, categories)
  const call = async (ch: string, ...args: unknown[]) => await handlers.get(ch)!(...args)
  return { call, broadcast }
}

describe('IPC validation', () => {
  it('serves valid calls', async () => {
    const { call } = setup()
    expect(await call('device:list')).toEqual([fixture.device])
    expect(await call('layout:get', fixture.device.udid)).toEqual({
      layout: normalize(fixture.rawState, gridFor('iPhone'))
    })
  })

  it('lists apps with a category each, joined from the phone and the layout', async () => {
    const { call } = setup()
    const { apps, lookup } = (await call('apps:list', fixture.device.udid)) as AppsResult
    expect(apps.length).toBeGreaterThan(5)
    expect(lookup).toBe('running')
    for (const a of apps)
      expect(a.category).toBe(a.bundleId.startsWith('com.apple.') ? 'Apple' : 'Unknown')
  })

  it('rejects a malformed payload with a readable zod error', async () => {
    const { call } = setup()
    await expect(call('layout:get', 123)).rejects.toThrow(/Invalid arguments for layout:get/)
    await expect(call('layout:get')).rejects.toThrow(/Invalid arguments/)
    await expect(call('layout:get', '')).rejects.toThrow(/Invalid arguments/)
    await expect(call('device:list', 'extra')).rejects.toThrow(/Invalid arguments/)
  })
})
