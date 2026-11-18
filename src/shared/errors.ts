import type { ApplyErrorCode, Device } from './types'

// What the Connect screen says for each situation. Wording only; the screen decides the layout.
export interface ConnectMessage {
  title: string
  body: string
  severity: 'info' | 'warning' | 'error'
  illustration: 'cable' | 'lock' | 'trust' | 'warning'
  steps?: string[]
  action?: 'retry' | 'continue-read-only'
}

export const CONNECT_STEPS = [
  'Connect the cable',
  'Unlock your iPhone',
  'Tap Trust and enter your passcode'
]

export function connectMessage(device: Device | undefined): ConnectMessage {
  if (!device) {
    return {
      title: 'Connect your iPhone',
      body: 'Plug your iPhone or iPad into this Mac with a cable.',
      severity: 'info',
      illustration: 'cable',
      steps: CONNECT_STEPS
    }
  }
  const kind = device.deviceClass
  switch (device.state) {
    case 'locked':
      return {
        title: `Unlock ${device.name} to continue`,
        body: 'Jiggle continues by itself as soon as the screen is unlocked.',
        severity: 'info',
        illustration: 'lock',
        steps: CONNECT_STEPS
      }
    case 'trust-pending':
      return {
        title: `Tap Trust on your ${kind}`,
        body: 'If it asks, enter your passcode. Jiggle continues by itself.',
        severity: 'info',
        illustration: 'trust',
        steps: CONNECT_STEPS
      }
    case 'trust-declined':
      return {
        title: "Jiggle wasn't trusted",
        body: `Unplug and reconnect your ${kind}, then tap Trust.`,
        severity: 'error',
        illustration: 'trust',
        action: 'retry'
      }
    case 'unsupported-os':
      return {
        title: `iOS ${device.osVersion} isn't supported for changes`,
        body: 'You can preview your layout, but Apply is turned off.',
        severity: 'warning',
        illustration: 'warning',
        action: 'continue-read-only'
      }
    case 'error':
      return {
        title: `Couldn't connect to ${device.name}`,
        body: `Unplug your ${kind}, plug it back in and unlock it, then try again.`,
        severity: 'error',
        illustration: 'cable',
        action: 'retry'
      }
    case 'ready':
      return {
        title: `Connected to ${device.name}`,
        body: 'Opening your home screen…',
        severity: 'info',
        illustration: 'cable'
      }
  }
}

// Everything that can go wrong after connecting: one title and message each, so a banner, an alert and the
// log all say the same thing. `detail` is the raw reason, `time` a clock time, `version` an iOS version.
export interface AppError {
  title: string
  message: string
}
export type ErrorCode =
  ApplyErrorCode | 'engine-restarting' | 'engine-failed' | 'lookup-offline' | 'read-only'
export interface ErrorVars {
  detail?: string
  time?: string
  version?: string
}

export function appError(code: ErrorCode, v: ErrorVars = {}): AppError {
  switch (code) {
    case 'busy':
      return {
        title: 'Still working',
        message: 'Another change to this iPhone is already running.'
      }
    case 'no-device':
      return { title: 'No iPhone', message: v.detail ?? 'Unlock your iPhone and try again.' }
    case 'read-only':
      return {
        title: 'Read-only mode',
        message: `Apply is turned off for iOS ${v.version}. You can still preview your layout.`
      }
    case 'layout-changed':
      return {
        title: 'Your iPhone changed',
        message: 'Your iPhone’s layout changed since the preview. Refresh and try again.'
      }
    case 'invalid':
      return {
        title: 'Can’t apply this layout',
        message: `This layout can’t be applied: ${v.detail ?? 'it failed a check'}`
      }
    case 'not-found':
      return { title: 'Backup unavailable', message: v.detail ?? 'No such backup.' }
    case 'write-failed':
      return {
        title: 'Couldn’t write to the iPhone',
        message: `${v.detail ?? 'The write failed'}. If it is locked, unlock it and try again.`
      }
    case 'interrupted':
      return {
        title: 'Apply interrupted',
        message: `The iPhone was disconnected while writing. Reconnect it, then restore the backup from ${v.time ?? 'a moment ago'}.`
      }
    case 'verify-failed':
      return {
        title: 'The layout didn’t stick',
        message:
          'The iPhone doesn’t show the new layout exactly. Your old layout is backed up in History.'
      }
    case 'engine-restarting':
      return {
        title: 'The device engine stopped',
        message: 'Jiggle is restarting it. This usually takes a few seconds.'
      }
    case 'engine-failed':
      return {
        title: 'The device engine won’t start',
        message:
          'Quit and reopen Jiggle. If it keeps happening, the log in ~/Library/Logs/Jiggle has the details.'
      }
    case 'lookup-offline':
      return {
        title: 'Can’t reach the App Store',
        message: 'Some categories show as Unknown. They fill in next launch once you’re online.'
      }
  }
}
