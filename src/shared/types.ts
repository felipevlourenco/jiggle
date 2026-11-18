export type Udid = string

export type DeviceState =
  'ready' | 'locked' | 'trust-pending' | 'trust-declined' | 'unsupported-os' | 'error'

export interface Device {
  udid: Udid
  name: string
  productType: string
  modelName: string
  deviceClass: 'iPhone' | 'iPad'
  osVersion: string
  connection: 'usb' | 'wifi'
  state: DeviceState
}

// The untouched SpringBoard icon state: [dock, page 1, page 2, …].
// It becomes a typed Layout in M5.
export type RawItem = Record<string, unknown>
export type RawIconState = RawItem[][]
