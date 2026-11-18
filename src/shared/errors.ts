import type { Device } from './types'

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
        illustration: 'lock'
      }
    case 'trust-pending':
      return {
        title: `Tap Trust on your ${kind}`,
        body: 'If it asks, enter your passcode. Jiggle continues by itself.',
        severity: 'info',
        illustration: 'trust'
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
