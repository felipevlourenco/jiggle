import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import type { SidecarStatus } from '@shared/ipc-contract'
import type { Device, RawIconState } from '@shared/types'
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

// After this many failed starts in a row the status becomes 'failed' (retries continue).
const FAILED_AFTER = 5

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

  // ponytail: the engine only reports UDIDs until `device_info` lands in M4, so nothing to list yet.
  async listDevices(): Promise<Device[]> {
    return []
  }

  async getIconState(): Promise<RawIconState> {
    throw new Error('Reading the icon state arrives in M5')
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
    log.info(`device ${event === 'device_attached' ? 'attached' : 'detached'}: ${parsed.data.udid}`)
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
