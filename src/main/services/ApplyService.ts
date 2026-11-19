import { appError, type ErrorVars } from '@shared/errors'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { serialize } from '@shared/layout/serialize'
import { reflow } from '@shared/layout/reflow'
import { layoutSignature } from '@shared/layout/signature'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { Broadcast } from '@shared/ipc-contract'
import type {
  ApplyErrorCode,
  ApplyPlan,
  ApplyResult,
  ApplyStep,
  Device,
  Grid,
  RawIconState,
  SnapshotSummary,
  Udid
} from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'
import type { SnapshotService } from './SnapshotService'

interface Deps {
  bridge: DeviceBridge
  snapshots: SnapshotService
  broadcast: Broadcast
  log: Logger
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// The only place that writes to a phone. Every change goes through the same steps, one at a time per device:
// check the phone is as expected, back it up, write, read it back and compare. Never throws: a refusal or a
// failure is an `ok: false` result that says what happened and where the backup is.
export class ApplyService {
  private readonly busy = new Set<Udid>()

  constructor(private readonly deps: Deps) {}

  // A refusal or failure, worded by the error catalog and logged with its code.
  private fail(
    device: Pick<Device, 'deviceClass'> | undefined,
    code: ApplyErrorCode,
    vars: ErrorVars = {},
    backup?: SnapshotSummary
  ): ApplyResult {
    const { message } = appError(code, { kind: device?.deviceClass, ...vars })
    this.deps.log.warn(`apply failed [${code}]: ${message}`)
    return { ok: false, code, message, backup }
  }

  apply(plan: ApplyPlan): Promise<ApplyResult> {
    return this.exclusive(plan.udid, async (device) => {
      const current = await this.read(device, 'checking')
      if (typeof current === 'string') return this.fail(device, 'no-device', { detail: current })
      if (layoutSignature(current) !== plan.beforeSignature)
        return this.fail(device, 'layout-changed')
      let after: RawIconState
      try {
        const before = normalize(current, await this.gridOf(device))
        const issues = validateLayout(before, plan.after, plan.removedFromHomeScreen)
        if (issues.length) {
          return this.fail(device, 'invalid', {
            detail: `${issues.map(describeIssue).join('; ')}.`
          })
        }
        after = serialize(plan.after)
      } catch (err) {
        return this.fail(device, 'invalid', { detail: reason(err) })
      }
      return this.writeAndVerify(device, current, `Before ${plan.reason}`, after)
    })
  }

  restore(udid: Udid, snapshotId: string): Promise<ApplyResult> {
    return this.exclusive(udid, async (device) => {
      let target
      try {
        target = await this.deps.snapshots.get(udid, snapshotId)
      } catch (err) {
        return this.fail(device, 'not-found', { detail: reason(err) })
      }
      const current = await this.read(device, 'checking')
      if (typeof current === 'string') return this.fail(device, 'no-device', { detail: current })
      const what = target.name ?? target.reason ?? 'backup'
      return this.writeAndVerify(device, current, `Before restoring “${what}”`, target.rawState)
    })
  }

  // For another service that changes a device (uninstall): one change per device at a time.
  // Returns the release function, or null while something else is running.
  lock(udid: Udid): (() => void) | null {
    if (this.busy.has(udid)) return null
    this.busy.add(udid)
    return () => void this.busy.delete(udid)
  }

  // Switch to a saved layout: its arrangement fitted to the apps the phone has now (see reflow).
  switchTo(udid: Udid, snapshotId: string): Promise<ApplyResult> {
    return this.exclusive(udid, async (device) => {
      let saved
      try {
        saved = await this.deps.snapshots.get(udid, snapshotId)
      } catch (err) {
        return this.fail(device, 'not-found', { detail: reason(err) })
      }
      const current = await this.read(device, 'checking')
      if (typeof current === 'string') return this.fail(device, 'no-device', { detail: current })
      let next: RawIconState
      try {
        const grid = await this.gridOf(device)
        const before = normalize(current, grid)
        const after = reflow(normalize(saved.rawState, grid), before)
        // The saved layout brings its own widgets, like a restore does, so only the apps are checked.
        const issues = validateLayout(before, after).filter((i) => i.code !== 'widget-changed')
        if (issues.length) {
          return this.fail(device, 'invalid', {
            detail: `${issues.map(describeIssue).join('; ')}.`
          })
        }
        next = serialize(after)
      } catch (err) {
        return this.fail(device, 'invalid', { detail: reason(err) })
      }
      const what = saved.name ?? saved.reason ?? 'backup'
      return this.writeAndVerify(device, current, `Before switching to ${what}`, next)
    })
  }

  // Back up `current`, write `next`, read it back. Shared by apply, switch and restore.
  private async writeAndVerify(
    device: Device,
    current: RawIconState,
    backupReason: string,
    next: RawIconState
  ): Promise<ApplyResult> {
    const { bridge, snapshots, broadcast, log } = this.deps
    this.step('backing-up')
    let backup: SnapshotSummary
    try {
      backup = await snapshots.create({
        udid: device.udid,
        kind: 'auto-backup',
        name: null,
        reason: backupReason,
        osVersion: device.osVersion,
        deviceClass: device.deviceClass,
        rawState: current
      })
    } catch (err) {
      // No backup, no write.
      return this.fail(device, 'write-failed', {
        detail: `Couldn’t save a backup, so nothing was changed: ${reason(err)}`
      })
    }
    broadcast('snapshots:changed', undefined)

    this.step('writing')
    try {
      await bridge.setIconState(device.udid, next)
    } catch (err) {
      log.error('apply: write failed:', reason(err))
      // Unplugged mid-write: the backup is the way back once the phone is reconnected.
      const stillThere = (await bridge.listDevices().catch(() => [])).some(
        (d) => d.udid === device.udid
      )
      if (!stillThere) {
        const time = new Date(backup.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })
        return this.fail(device, 'interrupted', { time }, backup)
      }
      return this.fail(
        device,
        'write-failed',
        { detail: `Couldn’t write to the ${device.deviceClass}: ${reason(err)}` },
        backup
      )
    }

    this.step('verifying')
    const readBack = await this.read(device)
    if (typeof readBack === 'string' || layoutSignature(readBack) !== layoutSignature(next)) {
      return this.fail(device, 'verify-failed', {}, backup)
    }
    log.info(`apply: ${backupReason} done, backup ${backup.id}`)
    return { ok: true, backup }
  }

  // The device's icon state, or a message when it can't be read.
  private async read(
    device: Pick<Device, 'udid' | 'deviceClass'>,
    step?: ApplyStep
  ): Promise<RawIconState | string> {
    if (step) this.step(step)
    try {
      return await this.deps.bridge.getIconState(device.udid)
    } catch (err) {
      return `Couldn’t read the ${device.deviceClass}: ${reason(err)}`
    }
  }

  // TODO(iPad): never run against a real iPad (no device to test with). When one is available, check that
  // apply, restore and switch write and verify on it, that the reported grid (get_icon_metrics) matches the
  // preview, and that widget spans in place.ts and the frame in PhoneFrame.tsx look right. See M20 in plan.md.
  // The grid the device itself reports, or the default for its class: the one the preview was drawn with.
  private async gridOf(device: Device): Promise<Grid> {
    return gridFor(device.deviceClass, await this.deps.bridge.getIconMetrics(device.udid))
  }

  private step(step: ApplyStep): void {
    this.deps.broadcast('apply:progress', step)
  }

  // One change per device at a time; also refuses a device that can't be written to.
  private async exclusive(
    udid: Udid,
    work: (device: Device) => Promise<ApplyResult>
  ): Promise<ApplyResult> {
    if (this.busy.has(udid)) {
      const known = (await this.deps.bridge.listDevices().catch(() => [])).find(
        (d) => d.udid === udid
      )
      return this.fail(known, 'busy') // only for the wording: iPhone or iPad
    }
    this.busy.add(udid)
    let device: Device | undefined
    try {
      device = (await this.deps.bridge.listDevices()).find((d) => d.udid === udid)
      if (!device)
        return this.fail(undefined, 'no-device', { detail: 'The device isn’t connected.' })
      if (device.state === 'unsupported-os') {
        return this.fail(device, 'read-only', { version: device.osVersion })
      }
      if (device.state !== 'ready') return this.fail(device, 'no-device')
      return await work(device)
    } catch (err) {
      this.deps.log.error('apply: unexpected error:', reason(err))
      return this.fail(device, 'write-failed', { detail: reason(err) })
    } finally {
      this.busy.delete(udid)
    }
  }
}
