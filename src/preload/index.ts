import { contextBridge, ipcRenderer } from 'electron'
import type { ChannelArgs, ChannelName, ChannelResult, JiggleApi } from '@shared/ipc-contract'

// Type-only imports: a sandboxed preload can't load zod at runtime. Main validates every call.
const invoke = <C extends ChannelName>(channel: C, ...args: ChannelArgs<C>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<ChannelResult<C>>

const api: JiggleApi = {
  device: {
    list: () => invoke('device:list'),
    onChanged: (listener) => {
      // Don't hand the IpcRendererEvent to the page.
      const wrapped = (): void => listener()
      ipcRenderer.on('device:changed', wrapped)
      return () => ipcRenderer.removeListener('device:changed', wrapped)
    }
  },
  layout: { get: (udid) => invoke('layout:get', udid) }
}

contextBridge.exposeInMainWorld('jiggle', api)
