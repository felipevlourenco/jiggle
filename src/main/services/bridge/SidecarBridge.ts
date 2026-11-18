import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { schemas, type SidecarStatus } from '@shared/ipc-contract'
import type { Device, DeviceState, Grid, InstalledApp, RawIconState, Udid } from '@shared/types'
import type { DeviceBridge } from './DeviceBridge'

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface SidecarOptions {
  command: string
  args?: string[]
  cwd?: string
  log: Logger
  requestTimeoutMs?: number
  backoffMs?: number
  maxBackoffMs?: number
  // How often a phone that needs the user (locked, Trust prompt) is re-checked.
  pollMs?: number
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

// Everything the engine can print on stdout: a response (id + result/error) or an event.
const Message = z.object({
  id: z.number().nullish(),
  result: z.unknown().optional(), // zod 4: a bare z.unknown() key is required
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  event: z.string().optional(),
  data: z.unknown().optional()
})
const DeviceEvent = z.object({ udid: z.string() })
const Metrics = z.object({
  homeScreenIconColumns: z.number(),
  homeScreenIconRows: z.number(),
  homeScreenIconDockMaxCount: z.number()
})
const Base64Map = z.record(z.string(), z.string())
const InstalledApps = z.array(
  z.object({ bundleId: z.string(), name: z.string(), removable: z.boolean() })
)

// States that can fix themselves without a new plug-in, so we keep re-checking them.
const POLLED_STATES: DeviceState[] = ['locked', 'trust-pending', 'error']
const MAX_POLLS = 15

// After this many failed starts in a row the status becomes 'failed' (retries continue).
const FAILED_AFTER = 5

function unknownDevice(udid: Udid): Device {
  return {
    udid,
    name: 'iPhone',
    productType: '',
    modelName: 'iPhone',
    deviceClass: 'iPhone',
    osVersion: '',
    connection: 'usb',
    state: 'error'
  }
}

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

// Talks to the Python engine over newline-delimited JSON on stdio and keeps it alive.
export class SidecarBridge implements DeviceBridge {
  private child: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private deviceListeners = new Set<() => void>()
  private statusListeners = new Set<(status: SidecarStatus) => void>()
  private attached = new Set<Udid>()
  private devices = new Map<Udid, Device>()
  private polls = new Map<Udid, NodeJS.Timeout>()
  private status: SidecarStatus = 'starting'
  private attempts = 0
  private restartTimer: NodeJS.Timeout | null = null
  private stopped = true

  constructor(private readonly opts: SidecarOptions) {}

  start(): void {
    this.stopped = false
    this.setStatus('starting')
    this.spawnEngine()
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const child = this.child
    this.child = null
    this.rejectAll(new Error('Engine stopped'))
    this.forgetDevices()
    child?.kill()
  }

  getStatus(): SidecarStatus {
    return this.status
  }

  onStatus(listener: (status: SidecarStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onDevicesChanged(listener: () => void): () => void {
    this.deviceListeners.add(listener)
    return () => this.deviceListeners.delete(listener)
  }

  async listDevices(): Promise<Device[]> {
    return [...this.devices.values()]
  }

  async refreshDevice(udid: Udid): Promise<void> {
    await this.probe(udid, 0)
  }

  async getIconState(udid: Udid): Promise<RawIconState> {
    return schemas.RawIconState.parse(await this.request('get_icon_state', { udid }, 30_000))
  }

  async getIconMetrics(udid: Udid): Promise<Grid | null> {
    try {
      const m = Metrics.parse(await this.request('get_icon_metrics', { udid }, 15_000))
      return {
        columns: m.homeScreenIconColumns,
        rows: m.homeScreenIconRows,
        dockMax: m.homeScreenIconDockMaxCount
      }
    } catch (err) {
      this.opts.log.warn('icon metrics unavailable:', (err as Error).message)
      return null
    }
  }

  async getIcons(udid: Udid, bundleIds: string[]): Promise<Map<string, Buffer>> {
    const icons = Base64Map.parse(
      await this.request('get_icons', { udid, bundle_ids: bundleIds }, 60_000)
    )
    return new Map(Object.entries(icons).map(([id, b64]) => [id, Buffer.from(b64, 'base64')]))
  }

  async listApps(udid: Udid): Promise<InstalledApp[]> {
    return InstalledApps.parse(await this.request('list_apps', { udid }, 30_000))
  }

  request<T = unknown>(method: string, params: object = {}, timeoutMs?: number): Promise<T> {
    const stdin = this.child?.stdin
    if (!stdin?.writable) return Promise.reject(new Error('Engine is not running'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id)
          reject(new Error(`Engine request timed out: ${method}`))
        },
        timeoutMs ?? this.opts.requestTimeoutMs ?? 10_000
      )
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  private spawnEngine(): void {
    const { command, args = [], cwd, log } = this.opts
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    })
    this.child = child

    createInterface({ input: child.stdout! }).on('line', (line) => this.onLine(line))
    createInterface({ input: child.stderr! }).on('line', (line) =>
      log.warn('[engine stderr]', line)
    )
    child.stdin!.on('error', () => {}) // a dead engine surfaces via 'exit', not an EPIPE crash
    child.once('error', (err) => {
      log.error('engine failed to start:', err.message)
      this.onExit(child)
    })
    child.once('exit', (code, signal) => {
      log.warn(`engine exited (code ${code}, signal ${signal})`)
      this.onExit(child)
    })

    this.request<{ version: string }>('ping', {}, 5_000)
      .then(async ({ version }) => {
        if (this.child !== child) return
        this.attempts = 0
        log.info(`engine ready (version ${version})`)
        this.setStatus('ready')
        await this.request('watch')
      })
      .catch((err: Error) => {
        if (this.child !== child) return
        log.error('engine did not come up:', err.message)
        child.kill()
      })
  }

  private onExit(child: ChildProcess): void {
    if (this.child !== child) return // already handled, or we stopped it on purpose
    this.child = null
    this.rejectAll(new Error('Engine stopped'))
    this.forgetDevices() // the restarted engine replays what is attached
    if (this.stopped) return
    const { backoffMs = 500, maxBackoffMs = 10_000, log } = this.opts
    this.attempts++
    const delay = Math.min(backoffMs * 2 ** (this.attempts - 1), maxBackoffMs)
    this.setStatus(this.attempts >= FAILED_AFTER ? 'failed' : 'restarting')
    log.warn(`restarting engine in ${delay} ms (attempt ${this.attempts})`)
    this.restartTimer = setTimeout(() => this.spawnEngine(), delay)
  }

  private onLine(line: string): void {
    const { log } = this.opts
    let msg: z.infer<typeof Message>
    try {
      msg = Message.parse(JSON.parse(line))
    } catch {
      log.warn('engine sent an unreadable line:', line)
      return
    }
    if (msg.event) return this.onEvent(msg.event, msg.data)
    if (msg.id == null) return log.warn('engine sent a message with no id:', line)
    const pending = this.pending.get(msg.id)
    if (!pending) return // timed out already
    this.pending.delete(msg.id)
    clearTimeout(pending.timer)
    if (msg.error) pending.reject(new EngineError(msg.error.code, msg.error.message))
    else pending.resolve(msg.result)
  }

  private onEvent(event: string, data: unknown): void {
    const { log } = this.opts
    if (event !== 'device_attached' && event !== 'device_detached') {
      return log.debug('ignoring engine event', event)
    }
    const parsed = DeviceEvent.safeParse(data)
    if (!parsed.success) return log.warn('bad payload for', event, data)
    const { udid } = parsed.data
    if (event === 'device_attached') {
      log.info(`device attached: ${udid}`)
      this.attached.add(udid)
      void this.probe(udid, 0)
    } else {
      log.info(`device detached: ${udid}`)
      this.attached.delete(udid)
      this.clearPoll(udid)
      if (this.devices.delete(udid)) this.notifyDevicesChanged()
    }
  }

  // Ask the engine about one device, store the answer, and keep re-checking while it needs the user.
  private async probe(udid: Udid, attempt: number): Promise<void> {
    const { log, pollMs = 2000 } = this.opts
    this.clearPoll(udid)
    const previous = this.devices.get(udid)
    let device: Device
    try {
      device = schemas.Device.parse(await this.request('device_info', { udid }, 15_000))
    } catch (err) {
      if (!this.attached.has(udid)) return
      log.warn(`device_info failed for ${udid}:`, (err as Error).message)
      device = previous
        ? { ...previous, state: 'error' }
        : { ...unknownDevice(udid), state: 'error' }
    }
    if (!this.attached.has(udid)) return // unplugged while we were asking
    if (JSON.stringify(previous) !== JSON.stringify(device)) {
      log.info(`device ${udid} is ${device.state}`)
      this.devices.set(udid, device)
      this.notifyDevicesChanged()
    }
    if (POLLED_STATES.includes(device.state) && attempt < MAX_POLLS) {
      this.polls.set(
        udid,
        setTimeout(() => void this.probe(udid, attempt + 1), pollMs)
      )
    }
  }

  private clearPoll(udid: Udid): void {
    const timer = this.polls.get(udid)
    if (timer) clearTimeout(timer)
    this.polls.delete(udid)
  }

  private forgetDevices(): void {
    for (const udid of this.polls.keys()) this.clearPoll(udid)
    const hadDevices = this.devices.size > 0
    this.attached.clear()
    this.devices.clear()
    if (hadDevices) this.notifyDevicesChanged()
  }

  private notifyDevicesChanged(): void {
    for (const listener of this.deviceListeners) listener()
  }

  private rejectAll(error: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.pending.clear()
  }

  private setStatus(status: SidecarStatus): void {
    if (status === this.status && status !== 'starting') return
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}
