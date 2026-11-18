import { z } from 'zod'
import type { Device, LayoutResult } from './types'

const Udid = z.string().min(1)

const Device_ = z.object({
  udid: Udid,
  name: z.string(),
  productType: z.string(),
  modelName: z.string(),
  deviceClass: z.enum(['iPhone', 'iPad']),
  osVersion: z.string(),
  connection: z.enum(['usb', 'wifi']),
  state: z.enum(['ready', 'locked', 'trust-pending', 'trust-declined', 'unsupported-os', 'error'])
})

const RawIconState_ = z.array(z.array(z.record(z.string(), z.unknown())))

export const schemas = { Udid, Device: Device_, RawIconState: RawIconState_ }

// One entry per request channel (`domain:action`): its argument tuple and its result.
// Main validates `args` on every call; `result` only types the renderer.
export const channels = {
  'device:list': { args: z.tuple([]), result: z.array(Device_) },
  'device:refresh': { args: z.tuple([Udid]), result: z.void() },
  'layout:get': { args: z.tuple([Udid]), result: z.custom<LayoutResult>() }
} as const

export type ChannelName = keyof typeof channels
export type ChannelArgs<C extends ChannelName> = z.infer<(typeof channels)[C]['args']>
export type ChannelResult<C extends ChannelName> = z.infer<(typeof channels)[C]['result']>

const SidecarStatus = z.enum(['starting', 'ready', 'restarting', 'failed'])
export type SidecarStatus = z.infer<typeof SidecarStatus>

// Main → renderer events and their payloads. `device:changed` carries none: the renderer refetches.
export const events = {
  'device:changed': z.undefined(),
  'sidecar:status': SidecarStatus
} as const

export type EventName = keyof typeof events
export type EventPayload<E extends EventName> = z.infer<(typeof events)[E]>
export type Broadcast = <E extends EventName>(event: E, payload: EventPayload<E>) => void

// What preload exposes as `window.jiggle`.
export interface JiggleApi {
  device: {
    list(): Promise<Device[]>
    // Re-check one device now (the "Try Again" button).
    refresh(udid: string): Promise<void>
    onChanged(listener: () => void): () => void
  }
  layout: {
    get(udid: string): Promise<LayoutResult>
  }
  sidecar: {
    onStatus(listener: (status: SidecarStatus) => void): () => void
  }
}
