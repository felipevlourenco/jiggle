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
    overrides: () => invoke('apps:overrides'),
    setCategory: (bundleId, name, category) =>
      invoke('apps:set-category', bundleId, name, category),
    resetCategory: (bundleId) => invoke('apps:reset-category', bundleId),
    uninstall: (udid, bundleIds) => invoke('apps:uninstall', udid, bundleIds),
    onUninstallProgress: (listener) => on('uninstall:progress', listener),
    onChanged: (listener) => on('apps:changed', () => listener())
  },
  apply: {
    run: (plan) => invoke('apply:run', plan),
    restore: (udid, snapshotId) => invoke('apply:restore', udid, snapshotId),
    switchTo: (udid, snapshotId) => invoke('apply:switch', udid, snapshotId),
    onProgress: (listener) => on('apply:progress', listener)
  },
  snapshots: {
    list: (udid) => invoke('snapshots:list', udid),
    backup: (udid) => invoke('snapshots:backup', udid),
    newApps: (udid, bundleIds) => invoke('snapshots:new-apps', udid, bundleIds),
    saveLayout: (udid, name) => invoke('snapshots:save-layout', udid, name),
    renameLayout: (udid, id, name) => invoke('snapshots:rename-layout', udid, id, name),
    deleteLayout: (udid, id) => invoke('snapshots:delete-layout', udid, id),
    exportLayout: (udid, id) => invoke('snapshots:export-layout', udid, id),
    importLayout: (udid) => invoke('snapshots:import-layout', udid),
    onChanged: (listener) => on('snapshots:changed', () => listener()),
    onSaveRequested: (listener) => on('menu:save-layout', () => listener()),
    onCopyRequested: (listener) => on('menu:copy-layout', () => listener()),
    layout: (udid, id) => invoke('snapshots:layout', udid, id)
  },
  toast: { onShow: (listener) => on('toast', listener) },
  export: {
    run: (request) => invoke('export:run', request),
    reveal: (path) => invoke('export:reveal', path),
    onProgress: (listener) => on('export:progress', listener),
    onSaved: (listener) => on('export:saved', listener),
    onRequested: (listener) => on('menu:export', () => listener())
  },
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
