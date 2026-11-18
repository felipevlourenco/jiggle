import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import { serialize } from '@shared/layout/serialize'
import { layoutSignature } from '@shared/layout/signature'
import { describeIssue, validateLayout } from '@shared/layout/validate'
import type { Broadcast } from '@shared/ipc-contract'
import type {
  ApplyErrorCode,
  ApplyPlan,
  ApplyResult,
  ApplyStep,
  Device,
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

const fail = (code: ApplyErrorCode, message: string, backup?: SnapshotSummary): ApplyResult => ({
  ok: false,
  code,
  message,
  backup
})
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// The only place that writes to a phone. Every change goes through the same steps, one at a time per device:
// check the phone is as expected, back it up, write, read it back and compare. Never throws: a refusal or a
// failure is an `ok: false` result that says what happened and where the backup is.
export class ApplyService {
  private readonly busy = new Set<Udid>()

  constructor(private readonly deps: Deps) {}

  apply(plan: ApplyPlan): Promise<ApplyResult> {
    return this.exclusive(plan.udid, async (device) => {
      const current = await this.read(plan.udid, 'checking')
      if (typeof current === 'string') return fail('no-device', current)
      if (layoutSignature(current) !== plan.beforeSignature) {
        return fail(
          'layout-changed',
          'Your iPhone’s layout changed since the preview. Refresh and try again.'
        )
      }
      let after: RawIconState
      try {
        const before = normalize(current, gridFor(device.deviceClass))
        const issues = validateLayout(before, plan.after, plan.removedFromHomeScreen)
        if (issues.length) {
          return fail(
            'invalid',
            `This layout can’t be applied: ${issues.map(describeIssue).join('; ')}.`
          )
        }
        after = serialize(plan.after)
      } catch (err) {
        return fail('invalid', `This layout can’t be applied: ${reason(err)}`)
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
        return fail('not-found', reason(err))
      }
      const current = await this.read(udid, 'checking')
      if (typeof current === 'string') return fail('no-device', current)
      const what = target.name ?? target.reason ?? 'backup'
      return this.writeAndVerify(device, current, `Before restoring “${what}”`, target.rawState)
    })
  }

  // Back up `current`, write `next`, read it back. Shared by apply and restore.
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
        rawState: current
      })
    } catch (err) {
      // No backup, no write.
      return fail('write-failed', `Couldn’t save a backup, so nothing was changed: ${reason(err)}`)
    }
    broadcast('snapshots:changed', undefined)

    this.step('writing')
    try {
      await bridge.setIconState(device.udid, next)
    } catch (err) {
      log.error('apply: write failed:', reason(err))
      return fail(
        'write-failed',
        `Couldn’t write to the iPhone: ${reason(err)}. If it is locked, unlock it and try again.`,
        backup
      )
    }

    this.step('verifying')
    const readBack = await this.read(device.udid)
    if (typeof readBack === 'string' || layoutSignature(readBack) !== layoutSignature(next)) {
      return fail(
        'verify-failed',
        'The iPhone doesn’t show the new layout exactly. Your old layout is backed up in History.',
        backup
      )
    }
    log.info(`apply: ${backupReason} done, backup ${backup.id}`)
    return { ok: true, backup }
  }

  // The device's icon state, or a message when it can't be read.
  private async read(udid: Udid, step?: ApplyStep): Promise<RawIconState | string> {
    if (step) this.step(step)
    try {
      return await this.deps.bridge.getIconState(udid)
    } catch (err) {
      return `Couldn’t read the iPhone: ${reason(err)}`
    }
  }

  private step(step: ApplyStep): void {
    this.deps.broadcast('apply:progress', step)
  }

  // One change per device at a time; also refuses a device that can't be written to.
  private async exclusive(
    udid: Udid,
    work: (device: Device) => Promise<ApplyResult>
  ): Promise<ApplyResult> {
    if (this.busy.has(udid))
      return fail('busy', 'Another change to this iPhone is already running.')
    this.busy.add(udid)
    try {
      const device = (await this.deps.bridge.listDevices()).find((d) => d.udid === udid)
      if (!device) return fail('no-device', 'The iPhone isn’t connected.')
      if (device.state === 'unsupported-os') {
        return fail('read-only', `Changes are turned off for iOS ${device.osVersion}.`)
      }
      if (device.state !== 'ready') return fail('no-device', 'Unlock your iPhone and try again.')
      return await work(device)
    } catch (err) {
      this.deps.log.error('apply: unexpected error:', reason(err))
      return fail('write-failed', reason(err))
    } finally {
      this.busy.delete(udid)
    }
  }
}
