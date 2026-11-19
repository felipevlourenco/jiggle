import { contextBridge, ipcRenderer } from 'electron'
import type {
  ChannelArgs,
  ChannelName,
  ChannelResult,
  EventName,
  EventPayload,
  JiggleApi
} from '@shared/ipc-contract'

// Type-only imports: a sandboxed preload can't load zod at runtime. Main validates every call.
const invoke = <C extends ChannelName>(channel: C, ...args: ChannelArgs<C>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<ChannelResult<C>>

// Subscribe to a main → renderer event. Returns an unsubscribe function.
const on = <E extends EventName>(event: E, listener: (payload: EventPayload<E>) => void) => {
  // Don't hand the IpcRendererEvent to the page.
  const wrapped = (_e: unknown, payload: EventPayload<E>): void => listener(payload)
  ipcRenderer.on(event, wrapped)
  return () => ipcRenderer.removeListener(event, wrapped)
}

const api: JiggleApi = {
  device: {
    list: () => invoke('device:list'),
    refresh: (udid) => invoke('device:refresh', udid),
    onChanged: (listener) => on('device:changed', () => listener())
  },
  layout: { get: (udid) => invoke('layout:get', udid) },
  apps: {
    list: (udid) => invoke('apps:list', udid),
    onChanged: (listener) => on('apps:changed', () => listener())
  },
  apply: {
    run: (plan) => invoke('apply:run', plan),
    restore: (udid, snapshotId) => invoke('apply:restore', udid, snapshotId),
    onProgress: (listener) => on('apply:progress', listener)
  },
  snapshots: {
    list: (udid) => invoke('snapshots:list', udid),
    backup: (udid) => invoke('snapshots:backup', udid),
    onChanged: (listener) => on('snapshots:changed', () => listener())
  },
  toast: { onShow: (listener) => on('toast', listener) },
  pins: {
    get: (udid) => invoke('pins:get', udid),
    set: (udid, pins) => invoke('pins:set', udid, pins)
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    clearCache: () => invoke('settings:clear-cache'),
    onChanged: (listener) => on('settings:changed', listener)
  },
  sidecar: {
    status: () => invoke('sidecar:get'),
    onStatus: (listener) => on('sidecar:status', listener)
  }
}

contextBridge.exposeInMainWorld('jiggle', api)
