import { readFile } from 'node:fs/promises'
import writeFileAtomic from 'write-file-atomic'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Broadcast } from '@shared/ipc-contract'
import type { LayoutFileResult, SavedLayoutResult, SnapshotSummary, Udid } from '@shared/types'
import type { DeviceBridge } from '../services/bridge/DeviceBridge'
import type { SnapshotService } from '../services/SnapshotService'
import { handle, type IpcLike } from './handle'

// The macOS file dialogs, which return a path, or undefined when the person cancels.
export interface LayoutFileDialogs {
  save(defaultName: string): Promise<string | undefined>
  open(): Promise<string | undefined>
}

interface Deps {
  bridge: DeviceBridge
  snapshots: SnapshotService
  broadcast: Broadcast
}
interface FileDeps extends Deps {
  dialogs: LayoutFileDialogs
}

// Reads the phone's icon state as it is right now and saves it. Shows a toast either way.
export async function backUpNow(
  { bridge, snapshots, broadcast }: Deps,
  udid: Udid
): Promise<SnapshotSummary> {
  try {
    const [rawState, devices] = await Promise.all([bridge.getIconState(udid), bridge.listDevices()])
    const device = devices.find((d) => d.udid === udid)
    const made = await snapshots.create({
      udid,
      kind: 'auto-backup',
      name: null,
      reason: 'Manual backup',
      osVersion: device?.osVersion ?? '',
      deviceClass: device?.deviceClass,
      rawState
    })
    broadcast('snapshots:changed', undefined)
    broadcast('toast', `Backed up · ${made.appCount} apps`)
    return made
  } catch (err) {
    broadcast('toast', `Couldn’t back up: ${(err as Error).message}`)
    throw err
  }
}

// Device > Back Up Now: the active device is the first ready one, as in the window.
export async function backUpActiveDevice(deps: Deps): Promise<void> {
  const device = (await deps.bridge.listDevices()).find((d) => d.state === 'ready')
  if (!device) {
    deps.broadcast('toast', 'Connect an unlocked iPhone or iPad to back it up.')
    return
  }
  await backUpNow(deps, device.udid).catch(() => {}) // already toasted
}

// A saved layout is the phone as it is now, under a name. A bad name or an unreadable phone is a result
// for the sheet to show, not an error.
export async function saveLayout(
  { bridge, snapshots, broadcast }: Deps,
  udid: Udid,
  name: string
): Promise<SavedLayoutResult> {
  try {
    const [rawState, devices] = await Promise.all([
      bridge.getIconState(udid),
      bridge.listDevices()
    ]).catch((err: Error) => {
      throw new Error(`Couldn’t read the iPhone: ${err.message}`, { cause: err })
    })
    const device = devices.find((d) => d.udid === udid)
    const layout = await snapshots.saveLayout({
      udid,
      name,
      osVersion: device?.osVersion ?? '',
      deviceClass: device?.deviceClass,
      rawState
    })
    broadcast('snapshots:changed', undefined)
    broadcast('toast', `Saved layout “${layout.name}”`)
    return { ok: true, layout }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

// Both always resolve: a closed dialog or a bad file is a result with a message, not an error.
async function exportLayout(
  { snapshots, broadcast, dialogs }: FileDeps,
  udid: Udid,
  id: string
): Promise<LayoutFileResult> {
  try {
    const { text, fileName } = await snapshots.exportLayout(udid, id)
    const path = await dialogs.save(fileName)
    if (!path) return { ok: false, canceled: true, message: '' }
    await writeFileAtomic(path, text)
    broadcast('toast', `Exported ${fileName}`)
    return { ok: true, message: `Exported ${fileName}` }
  } catch (err) {
    return { ok: false, canceled: false, message: (err as Error).message }
  }
}

async function importLayout(
  { snapshots, broadcast, dialogs }: FileDeps,
  udid: Udid
): Promise<LayoutFileResult> {
  try {
    const path = await dialogs.open()
    if (!path) return { ok: false, canceled: true, message: '' }
    const layout = await snapshots.importLayout(udid, await readFile(path, 'utf8'))
    broadcast('snapshots:changed', undefined)
    broadcast('toast', `Imported layout “${layout.name}”`)
    return { ok: true, message: `Imported layout “${layout.name}”` }
  } catch (err) {
    return { ok: false, canceled: false, message: (err as Error).message }
  }
}

// Rename and delete change a file, so they work with no phone plugged in.
async function changeSaved(
  { broadcast }: Deps,
  change: () => Promise<SnapshotSummary>
): Promise<SavedLayoutResult> {
  try {
    const layout = await change()
    broadcast('snapshots:changed', undefined)
    return { ok: true, layout }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

// File > Save Layout… and File > Export…: the window opens a sheet, which needs a phone to read first.
export async function requestSheet(
  { bridge, broadcast }: Pick<Deps, 'bridge' | 'broadcast'>,
  event: 'menu:save-layout' | 'menu:export' | 'menu:copy-layout',
  what: string
): Promise<void> {
  const ready = (await bridge.listDevices()).some(
    (d) => d.state === 'ready' || d.state === 'unsupported-os'
  )
  if (ready) broadcast(event, undefined)
  else broadcast('toast', `Connect an unlocked iPhone or iPad to ${what}.`)
}

export const requestSaveLayout = (deps: Pick<Deps, 'bridge' | 'broadcast'>): Promise<void> =>
  requestSheet(deps, 'menu:save-layout', 'save its layout')

export function registerSnapshotsIpc(ipc: IpcLike, deps: FileDeps): void {
  handle(ipc, 'snapshots:layout', async (udid, id) => {
    const saved = await deps.snapshots.get(udid, id)
    return normalize(saved.rawState, gridFor(saved.deviceClass ?? 'iPhone'))
  })
  handle(ipc, 'snapshots:save-layout', (udid, name) => saveLayout(deps, udid, name))
  handle(ipc, 'snapshots:rename-layout', (udid, id, name) =>
    changeSaved(deps, () => deps.snapshots.renameLayout(udid, id, name))
  )
  handle(ipc, 'snapshots:delete-layout', (udid, id) =>
    changeSaved(deps, () => deps.snapshots.deleteLayout(udid, id))
  )
  handle(ipc, 'snapshots:export-layout', (udid, id) => exportLayout(deps, udid, id))
  handle(ipc, 'snapshots:import-layout', (udid) => importLayout(deps, udid))
  handle(ipc, 'snapshots:list', (udid) => deps.snapshots.list(udid))
  handle(ipc, 'snapshots:backup', (udid) => backUpNow(deps, udid))
}
