import type { Device, RawIconState, Udid } from '@shared/types'

// Everything the app needs from a device. The Python sidecar implements it in M3;
// a pure TypeScript engine could replace it later without touching the UI.
export interface DeviceBridge {
  listDevices(): Promise<Device[]>
  // Re-check a device's state right away, e.g. after the user fixed what was blocking it.
  refreshDevice(udid: Udid): Promise<void>
  getIconState(udid: Udid): Promise<RawIconState>
  // Returns an unsubscribe function.
  onDevicesChanged(listener: () => void): () => void
}
