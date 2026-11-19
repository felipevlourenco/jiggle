import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ApplyResult, AppsResult, SavedLayoutResult, SnapshotSummary } from '@shared/types'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { MockBridge, loadFixture } from '../../services/bridge/MockBridge'
import { CategoryService } from '../../services/CategoryService'
import { ApplyService } from '../../services/ApplyService'
import { IconService } from '../../services/IconService'
import { PinsService } from '../../services/PinsService'
import { SettingsService } from '../../services/SettingsService'
import { SnapshotService } from '../../services/SnapshotService'
import { registerIpc } from '..'
import { requestSaveLayout } from '../snapshots'
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
    storefront: () => 'nl',
    log: silent,
    onChange() {},
    fetch: failing,
    sleep: async () => {}
  })
  const snapshots = new SnapshotService(root, silent)
  const apply = new ApplyService({ bridge, snapshots, broadcast, log: silent })
  const settings = new SettingsService(root, silent, 'nl')
  registerIpc(ipc, {
    bridge,
    broadcast,
    icons,
    categories,
    snapshots,
    apply,
    settings,
    pins: new PinsService(root, silent),
    sidecarStatus: () => 'ready'
  })
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

  it('backs up the phone, tells the window, and lists the backup', async () => {
    const { call, broadcast } = setup()
    expect(await call('snapshots:list', fixture.device.udid)).toEqual([])
    const made = (await call('snapshots:backup', fixture.device.udid)) as SnapshotSummary
    expect(made).toMatchObject({ kind: 'auto-backup', reason: 'Manual backup', damaged: false })
    expect(broadcast).toHaveBeenCalledWith('snapshots:changed', undefined)
    expect(broadcast).toHaveBeenCalledWith('toast', `Backed up · ${made.appCount} apps`)
    expect(await call('snapshots:list')).toHaveLength(1) // no udid: every device
    await expect(call('snapshots:list', '../evil')).rejects.toThrow('Bad device id')
  })

  it('toasts instead of going quiet when the backup fails', async () => {
    const { call, broadcast } = setup()
    await expect(call('snapshots:backup', 'UNKNOWN-1')).rejects.toThrow()
    expect(broadcast).toHaveBeenCalledWith('toast', expect.stringContaining('Couldn’t back up'))
  })

  it('saves, renames, switches to and deletes a layout; a bad name is a result, not an error', async () => {
    const { call, broadcast } = setup()
    const udid = fixture.device.udid
    const saved = (await call('snapshots:save-layout', udid, ' Work ')) as SavedLayoutResult
    expect(saved).toMatchObject({ ok: true, layout: { kind: 'saved-layout', name: 'Work' } })
    expect(broadcast).toHaveBeenCalledWith('toast', 'Saved layout “Work”')
    const id = saved.ok ? saved.layout.id : ''

    expect(await call('snapshots:save-layout', udid, 'work')).toEqual({
      ok: false,
      message: 'A layout named “work” already exists.'
    })
    expect(await call('snapshots:save-layout', 'UNKNOWN-1', 'Other')).toMatchObject({
      ok: false,
      message: expect.stringContaining('Couldn’t read the iPhone')
    })
    expect(await call('snapshots:rename-layout', udid, id, 'Office')).toMatchObject({
      ok: true,
      layout: { name: 'Office' }
    })
    expect(await call('apply:switch', udid, id)).toMatchObject({ ok: true })
    expect(((await call('apply:switch', udid, 'nope')) as ApplyResult).ok).toBe(false)

    expect(await call('snapshots:delete-layout', udid, id)).toMatchObject({ ok: true })
    expect(await call('snapshots:delete-layout', udid, id)).toMatchObject({ ok: false })
    await expect(call('snapshots:save-layout', udid)).rejects.toThrow(/Invalid arguments/)
  })

  it('reads and changes settings, and refuses a bad value', async () => {
    const { call } = setup()
    expect(await call('settings:get')).toEqual({
      theme: 'system',
      storefront: 'nl',
      backupRetention: 50,
      categoryLookupEnabled: true,
      updateCheckEnabled: true
    })
    expect(await call('settings:set', { theme: 'dark', backupRetention: 10 })).toMatchObject({
      theme: 'dark',
      backupRetention: 10,
      storefront: 'nl'
    })
    await expect(call('settings:set', { storefront: 'Netherlands' })).rejects.toThrow(
      /Invalid arguments/
    )
    await expect(call('settings:set', { backupRetention: 0 })).rejects.toThrow(/Invalid arguments/)
    expect(((await call('settings:get')) as { theme: string }).theme).toBe('dark')
    expect(await call('sidecar:get')).toBe('ready')
  })

  it('rejects a malformed payload with a readable zod error', async () => {
    const { call } = setup()
    await expect(call('layout:get', 123)).rejects.toThrow(/Invalid arguments for layout:get/)
    await expect(call('layout:get')).rejects.toThrow(/Invalid arguments/)
    await expect(call('layout:get', '')).rejects.toThrow(/Invalid arguments/)
    await expect(call('device:list', 'extra')).rejects.toThrow(/Invalid arguments/)
  })
})

describe('File > Save Layout…', () => {
  const silent = { debug() {}, info() {}, warn() {}, error() {} }
  const deps = (bridge: MockBridge) => ({
    bridge,
    broadcast: vi.fn(),
    snapshots: new SnapshotService(mkdtempSync(join(tmpdir(), 'jiggle-')), silent)
  })

  it('asks the window to open its sheet when a phone is ready', async () => {
    const d = deps(new MockBridge(fixture))
    await requestSaveLayout(d)
    expect(d.broadcast).toHaveBeenCalledWith('menu:save-layout', undefined)
  })

  it('says so in a toast when there is no phone', async () => {
    const d = deps(new MockBridge(null))
    await requestSaveLayout(d)
    expect(d.broadcast).toHaveBeenCalledWith(
      'toast',
      'Connect an unlocked iPhone to save its layout.'
    )
    expect(d.broadcast).not.toHaveBeenCalledWith('menu:save-layout', undefined)
  })
})
