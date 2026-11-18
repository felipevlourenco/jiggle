import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MockBridge, loadFixture } from '../../services/bridge/MockBridge'
import { registerIpc } from '..'
import type { IpcLike } from '../handle'

const fixture = loadFixture(join(__dirname, '../../../../tests/fixtures'), 'iphone-basic')

// A fake ipcMain: remembers handlers so tests can call them like the renderer would.
function setup() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ipc: IpcLike = { handle: (ch, fn) => void handlers.set(ch, (...a) => fn({}, ...a)) }
  const broadcast = vi.fn()
  registerIpc(ipc, new MockBridge(fixture), broadcast)
  const call = async (ch: string, ...args: unknown[]) => await handlers.get(ch)!(...args)
  return { call, broadcast }
}

describe('IPC validation', () => {
  it('serves valid calls', async () => {
    const { call } = setup()
    expect(await call('device:list')).toEqual([fixture.device])
    expect(await call('layout:get', fixture.device.udid)).toBe(fixture.rawState)
  })

  it('rejects a malformed payload with a readable zod error', async () => {
    const { call } = setup()
    await expect(call('layout:get', 123)).rejects.toThrow(/Invalid arguments for layout:get/)
    await expect(call('layout:get')).rejects.toThrow(/Invalid arguments/)
    await expect(call('layout:get', '')).rejects.toThrow(/Invalid arguments/)
    await expect(call('device:list', 'extra')).rejects.toThrow(/Invalid arguments/)
  })
})
