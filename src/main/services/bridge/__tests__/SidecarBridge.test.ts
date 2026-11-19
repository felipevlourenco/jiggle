import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SidecarStatus } from '@shared/ipc-contract'
import { EngineError, SidecarBridge } from '../SidecarBridge'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const fake = join(__dirname, 'fake-sidecar.mjs')

let bridge: SidecarBridge
afterEach(() => bridge.stop())

function create(command = process.execPath, args = [fake], pollMs = 10) {
  bridge = new SidecarBridge({
    command,
    args,
    log: silent,
    backoffMs: 10,
    maxBackoffMs: 40,
    requestTimeoutMs: 200,
    pollMs
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

  it('tracks a device: waits for trust, becomes ready, vanishes on detach', async () => {
    const statuses = create(process.execPath, [fake], 150)
    const changed = vi.fn()
    bridge.onDevicesChanged(changed)
    bridge.start()
    await until(statuses, 'ready')
    const state = async () => (await bridge.listDevices())[0]?.state
    await vi.waitFor(async () => expect(await state()).toBe('trust-pending'), { timeout: 3000 })
    await vi.waitFor(async () => expect(await state()).toBe('ready'), { timeout: 3000 })
    await bridge.request('detach')
    await vi.waitFor(async () => expect(await bridge.listDevices()).toEqual([]), { timeout: 3000 })
    expect(changed).toHaveBeenCalledTimes(3) // pending, ready, gone
  })

  it('refreshDevice re-checks right away instead of waiting for the poll', async () => {
    const statuses = create(process.execPath, [fake], 60_000)
    bridge.start()
    await until(statuses, 'ready')
    const state = async () => (await bridge.listDevices())[0]?.state
    await vi.waitFor(async () => expect(await state()).toBe('trust-pending'), { timeout: 3000 })
    await bridge.refreshDevice('U1') // 2nd check: still pending
    expect(await state()).toBe('trust-pending')
    await bridge.refreshDevice('U1') // 3rd check: ready
    expect(await state()).toBe('ready')
  })

  it('reads icon state, grid, icons', async () => {
    const statuses = create()
    bridge.start()
    await until(statuses, 'ready')
    expect(await bridge.getIconState('U1')).toHaveLength(2)
    expect(await bridge.getIconMetrics('U1')).toEqual({ columns: 4, rows: 6, dockMax: 4 })
    const icons = await bridge.getIcons('U1', ['a.b', 'c.d'])
    expect(icons.get('c.d')?.toString()).toBe('png-c.d')
  })

  it('reports failed when the engine never starts', async () => {
    const statuses = create('/nonexistent/engine', [])
    bridge.start()
    await until(statuses, 'failed')
  })

  it('tells the engine whether to look for Wi‑Fi devices: when it starts, and when the setting changes', async () => {
    const statuses = create()
    bridge.setWifi(true) // before the engine is up
    bridge.start()
    await until(statuses, 'ready')
    await vi.waitFor(async () => expect(await bridge.request('last_watch')).toEqual({ wifi: true }))
    bridge.setWifi(false)
    await vi.waitFor(async () =>
      expect(await bridge.request('last_watch')).toEqual({ wifi: false })
    )
  })

  it('gives a Wi‑Fi device three times as long to answer', async () => {
    const statuses = create()
    bridge.start()
    await until(statuses, 'ready')
    await bridge.request('attach', { udid: 'W1' })
    await vi.waitFor(async () =>
      expect((await bridge.listDevices()).find((d) => d.udid === 'W1')).toMatchObject({
        udid: 'W1',
        connection: 'wifi'
      })
    )
    const started = Date.now()
    await expect(bridge.request('hang', { udid: 'W1' })).rejects.toThrow('timed out')
    expect(Date.now() - started).toBeGreaterThanOrEqual(550) // 3 × the 200 ms of a cable
    const usb = Date.now()
    await expect(bridge.request('hang', { udid: 'nobody' })).rejects.toThrow('timed out')
    expect(Date.now() - usb).toBeLessThan(500)
  })
})
