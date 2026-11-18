import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SidecarStatus } from '@shared/ipc-contract'
import { EngineError, SidecarBridge } from '../SidecarBridge'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const fake = join(__dirname, 'fake-sidecar.mjs')

let bridge: SidecarBridge
afterEach(() => bridge.stop())

function create(command = process.execPath, args = [fake]) {
  bridge = new SidecarBridge({
    command,
    args,
    log: silent,
    backoffMs: 10,
    maxBackoffMs: 40,
    requestTimeoutMs: 200
  })
  const statuses: SidecarStatus[] = []
  bridge.onStatus((s) => statuses.push(s))
  return statuses
}

const until = (statuses: SidecarStatus[], status: SidecarStatus, from = 0) =>
  vi.waitFor(() => expect(statuses.indexOf(status, from)).toBeGreaterThanOrEqual(0), {
    timeout: 3000
  })

describe('SidecarBridge', () => {
  it('starts, pings and becomes ready', async () => {
    const statuses = create()
    bridge.start()
    await until(statuses, 'ready')
    expect(await bridge.request('ping')).toEqual({ version: 'fake' })
  })

  it('rejects engine errors and times out unanswered requests', async () => {
    const statuses = create()
    bridge.start()
    await until(statuses, 'ready')
    await expect(bridge.request('fail')).rejects.toMatchObject({ code: 'nope' })
    await expect(bridge.request('fail')).rejects.toBeInstanceOf(EngineError)
    await expect(bridge.request('hang')).rejects.toThrow('timed out')
  })

  it('restarts after a crash and rejects the in-flight request', async () => {
    const statuses = create()
    bridge.start()
    await until(statuses, 'ready')
    await expect(bridge.request('crash')).rejects.toThrow('Engine stopped')
    await until(statuses, 'restarting')
    await until(statuses, 'ready', statuses.indexOf('restarting'))
    expect(await bridge.request('ping')).toEqual({ version: 'fake' })
  })

  it('notifies listeners when devices attach and detach', async () => {
    const statuses = create()
    const changed = vi.fn()
    bridge.onDevicesChanged(changed)
    bridge.start()
    await until(statuses, 'ready')
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })

  it('reports failed when the engine never starts', async () => {
    const statuses = create('/nonexistent/engine', [])
    bridge.start()
    await until(statuses, 'failed')
  })
})
