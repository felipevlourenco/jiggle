import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { MockBridge, loadFixture } from '../../services/bridge/MockBridge'
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
  const icons = new IconService(bridge, mkdtempSync(join(tmpdir(), 'jiggle-')), silent)
  registerIpc(ipc, bridge, broadcast, icons)
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

  it('rejects a malformed payload with a readable zod error', async () => {
    const { call } = setup()
    await expect(call('layout:get', 123)).rejects.toThrow(/Invalid arguments for layout:get/)
    await expect(call('layout:get')).rejects.toThrow(/Invalid arguments/)
    await expect(call('layout:get', '')).rejects.toThrow(/Invalid arguments/)
    await expect(call('device:list', 'extra')).rejects.toThrow(/Invalid arguments/)
  })
})
