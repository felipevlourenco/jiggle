import { describe, expect, it } from 'vitest'
import { appError, connectMessage, type ErrorCode } from '../errors'
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

  it('names Apple’s driver on Windows when its USB service doesn’t answer', () => {
    const m = connectMessage(undefined, false, 'windows', true)
    expect(m.body).toContain('Apple Devices')
    expect(connectMessage(undefined, false, 'mac', true).title).toBe('Connect your iPhone')
    expect(connectMessage(device('locked'), false, 'windows', true).title).toContain('Unlock')
  })

  it('names usbmuxd on Linux without calling it missing: it only runs while a phone is plugged in', () => {
    const m = connectMessage(undefined, false, 'linux', true)
    expect(m.title).toBe('Connect your iPhone')
    expect(m.severity).toBe('info')
    expect(m.body).toContain('usbmuxd')
    expect(connectMessage(undefined, false, 'linux').body).not.toContain('usbmuxd')
  })

  it('mentions the Wi‑Fi network once Wi‑Fi devices are looked for', () => {
    expect(connectMessage(undefined).body).toContain('with a cable')
    expect(connectMessage(undefined, true).body).toContain('same Wi‑Fi network')
  })

  it('says iPad for an iPad: the title and the steps', () => {
    const ipad = { ...device('locked'), name: "Sam's iPad", deviceClass: 'iPad' } as const
    expect(connectMessage({ ...ipad, state: 'trust-pending' }).title).toBe('Tap Trust on your iPad')
    expect(connectMessage(ipad).steps).toContain('Unlock your iPad')
    expect(connectMessage(undefined).steps).toContain('Unlock your iPhone')
  })

  it('explains read-only mode for an unsupported iOS', () => {
    expect(connectMessage(device('unsupported-os', '16.7'))).toMatchObject({
      title: "iOS 16.7 isn't supported for changes",
      severity: 'warning',
      action: 'continue-read-only'
    })
  })
})

describe('appError', () => {
  const codes: ErrorCode[] = [
    'busy',
    'no-device',
    'read-only',
    'layout-changed',
    'invalid',
    'not-found',
    'write-failed',
    'interrupted',
    'verify-failed',
    'engine-restarting',
    'engine-failed',
    'lookup-offline'
  ]
  it.each(codes)('%s has a title and a message', (code) => {
    const e = appError(code, { detail: 'The reason it failed.', time: '09:42', version: '16.7' })
    expect(e.title.length).toBeGreaterThan(3)
    expect(e.message.length).toBeGreaterThan(10)
  })

  it('names the device class in the apply errors', () => {
    expect(appError('busy', { kind: 'iPad' }).message).toBe(
      'Another change to this iPad is already running.'
    )
    expect(appError('write-failed', { kind: 'iPad' }).title).toBe('Couldn’t write to the iPad')
    expect(appError('verify-failed').message).toContain('The iPhone')
  })

  it('fills in the details', () => {
    expect(appError('interrupted', { time: '09:42' }).message).toContain(
      'restore the backup from 09:42'
    )
    expect(appError('read-only', { version: '16.7' }).message).toContain('iOS 16.7')
  })
})
