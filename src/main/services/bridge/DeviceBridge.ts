import type { Device, Grid, InstalledApp, RawIconState, Udid } from '@shared/types'

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
  // Writes the whole home screen. The one call that changes a phone: only ApplyService makes it.
  setIconState(udid: Udid, state: RawIconState): Promise<void>
  // Every app a person can see on the phone, on the home screen or only in the App Library.
  listApps(udid: Udid): Promise<InstalledApp[]>
  // Deletes one app and its data. The engine refuses an app the phone doesn't list as removable.
  uninstall(udid: Udid, bundleId: string): Promise<void>
  // Returns an unsubscribe function.
  onDevicesChanged(listener: () => void): () => void
}
