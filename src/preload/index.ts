import { contextBridge } from 'electron'

// Typed API surface grows in M2. Nothing from Node or Electron is exposed directly.
contextBridge.exposeInMainWorld('jiggle', { platform: process.platform })
