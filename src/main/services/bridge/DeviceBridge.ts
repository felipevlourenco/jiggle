import type { Device, Grid, RawIconState, Udid } from '@shared/types'

// Everything the app needs from a device. The Python sidecar implements it in M3;
// a pure TypeScript engine could replace it later without touching the UI.
export interface DeviceBridge {
  listDevices(): Promise<Device[]>
  // Re-check a device's state right away, e.g. after the user fixed what was blocking it.
  refreshDevice(udid: Udid): Promise<void>
  getIconState(udid: Udid): Promise<RawIconState>
  // The grid the phone reports, or null if it won't say.
  getIconMetrics(udid: Udid): Promise<Grid | null>
  // PNG per bundle id. Apps whose icon can't be read are left out.
  getIcons(udid: Udid, bundleIds: string[]): Promise<Map<string, Buffer>>
  getWallpaper(udid: Udid): Promise<Buffer | null>
  // Returns an unsubscribe function.
  onDevicesChanged(listener: () => void): () => void
}
