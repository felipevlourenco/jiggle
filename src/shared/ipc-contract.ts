import { z } from 'zod'
import type {
  ApplyPlan,
  ApplyResult,
  ApplyStep,
  AppsResult,
  Device,
  Layout,
  LayoutResult,
  Settings,
  SnapshotEntry,
  SnapshotSummary
} from './types'

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

const Snapshot_ = z.object({
  id: z.string(),
  udid: Udid,
  kind: z.enum(['auto-backup', 'saved-layout']),
  name: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  osVersion: z.string(),
  appCount: z.number(),
  pageCount: z.number(),
  rawState: RawIconState_
})

// Main re-checks the layout itself (see ApplyService); this only guards the shape.
const isLayout = (v: unknown): v is Layout =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Layout).dock) &&
  Array.isArray((v as Layout).pages)
const ApplyPlan_ = z.object({
  udid: Udid,
  reason: z.string().min(1),
  beforeSignature: z.string(),
  after: z.custom<Layout>(isLayout),
  removedFromHomeScreen: z.array(z.string())
}) satisfies z.ZodType<ApplyPlan>

const Settings_ = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  storefront: z.string().regex(/^[a-z]{2}$/),
  backupRetention: z.number().int().min(5).max(200),
  categoryLookupEnabled: z.boolean()
}) satisfies z.ZodType<Settings>

export const schemas = { Udid, Device: Device_, RawIconState: RawIconState_, Snapshot: Snapshot_ }

// One entry per request channel (`domain:action`): its argument tuple and its result.
// Main validates `args` on every call; `result` only types the renderer.
export const channels = {
  'device:list': { args: z.tuple([]), result: z.array(Device_) },
  'device:refresh': { args: z.tuple([Udid]), result: z.void() },
  'layout:get': { args: z.tuple([Udid]), result: z.custom<LayoutResult>() },
  'apps:list': { args: z.tuple([Udid]), result: z.custom<AppsResult>() },
  // No udid: every device's snapshots, so History still works with nothing plugged in.
  'snapshots:list': { args: z.tuple([Udid.optional()]), result: z.custom<SnapshotEntry[]>() },
  'snapshots:backup': { args: z.tuple([Udid]), result: z.custom<SnapshotSummary>() },
  // Both always resolve: a refusal or failure is an `ok: false` result, not a thrown error.
  'settings:get': { args: z.tuple([]), result: z.custom<Settings>() },
  'settings:set': { args: z.tuple([Settings_.partial()]), result: z.custom<Settings>() },
  // Forget the category and icon caches (they are re-fetched when needed).
  'settings:clear-cache': { args: z.tuple([]), result: z.void() },
  'sidecar:get': {
    args: z.tuple([]),
    result: z.enum(['starting', 'ready', 'restarting', 'failed'])
  },
  'apply:run': { args: z.tuple([ApplyPlan_]), result: z.custom<ApplyResult>() },
  'apply:restore': { args: z.tuple([Udid, z.string().min(1)]), result: z.custom<ApplyResult>() }
} as const

export type ChannelName = keyof typeof channels
export type ChannelArgs<C extends ChannelName> = z.infer<(typeof channels)[C]['args']>
export type ChannelResult<C extends ChannelName> = z.infer<(typeof channels)[C]['result']>

const SidecarStatus = z.enum(['starting', 'ready', 'restarting', 'failed'])
export type SidecarStatus = z.infer<typeof SidecarStatus>

// Main → renderer events and their payloads. `device:changed` and `apps:changed` carry none: the renderer refetches.
export const events = {
  'device:changed': z.undefined(),
  'apps:changed': z.undefined(),
  'snapshots:changed': z.undefined(),
  'settings:changed': z.custom<Settings>(),
  'apply:progress': z.enum(['checking', 'backing-up', 'writing', 'verifying']),
  // A short message to show the person, e.g. "Backed up · 187 apps".
  toast: z.string(),
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
  apps: {
    list(udid: string): Promise<AppsResult>
    // Categories arrived from the App Store: refetch.
    onChanged(listener: () => void): () => void
  }
  apply: {
    run(plan: ApplyPlan): Promise<ApplyResult>
    restore(udid: string, snapshotId: string): Promise<ApplyResult>
    onProgress(listener: (step: ApplyStep) => void): () => void
  }
  snapshots: {
    list(udid?: string): Promise<SnapshotEntry[]>
    backup(udid: string): Promise<SnapshotSummary>
    onChanged(listener: () => void): () => void
  }
  toast: {
    onShow(listener: (message: string) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    clearCache(): Promise<void>
    onChanged(listener: (settings: Settings) => void): () => void
  }
  sidecar: {
    status(): Promise<SidecarStatus>
    onStatus(listener: (status: SidecarStatus) => void): () => void
  }
}
