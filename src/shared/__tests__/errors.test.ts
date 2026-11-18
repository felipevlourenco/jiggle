import { describe, expect, it } from 'vitest'
import { connectMessage } from '../errors'
import type { Device, DeviceState } from '../types'

const device = (state: DeviceState, osVersion = '26.1'): Device => ({
  udid: 'U1',
  name: "Sam's iPhone",
  productType: 'iPhone17,1',
  modelName: 'iPhone 16 Pro',
  deviceClass: 'iPhone',
  osVersion,
  connection: 'usb',
  state
})

describe('connectMessage', () => {
  it('asks to connect when there is no device', () => {
    const m = connectMessage(undefined)
    expect(m.title).toBe('Connect your iPhone')
    expect(m.steps).toHaveLength(3)
  })

  it.each([
    ['locked', "Unlock Sam's iPhone to continue", undefined],
    ['trust-pending', 'Tap Trust on your iPhone', undefined],
    ['trust-declined', "Jiggle wasn't trusted", 'retry'],
    ['error', "Couldn't connect to Sam's iPhone", 'retry']
  ] as const)('%s', (state, title, action) => {
    const m = connectMessage(device(state))
    expect(m.title).toBe(title)
    expect(m.action).toBe(action)
  })

  it('explains read-only mode for an unsupported iOS', () => {
    expect(connectMessage(device('unsupported-os', '16.7'))).toMatchObject({
      title: "iOS 16.7 isn't supported for changes",
      severity: 'warning',
      action: 'continue-read-only'
    })
  })
})
