import type { Device, RawIconState, Udid } from '@shared/types'

// Everything the app needs from a device. The Python sidecar implements it in M3;
// a pure TypeScript engine could replace it later without touching the UI.
export interface DeviceBridge {
  listDevices(): Promise<Device[]>
  getIconState(udid: Udid): Promise<RawIconState>
  // Returns an unsubscribe function.
  onDevicesChanged(listener: () => void): () => void
}
