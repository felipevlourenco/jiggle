import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockBridge, loadFixture } from '../MockBridge'

const dir = join(__dirname, '../../../../../tests/fixtures')

describe('fixtures', () => {
  it.each(['iphone-basic', 'iphone-widgets', 'iphone-ios16', 'iphone-messy'])(
    '%s loads and validates',
    (name) => {
      const f = loadFixture(dir, name)
      expect(f.rawState.length).toBeGreaterThan(1)
      expect(f.device.name).toBe("Sam's iPhone")
    }
  )

  it('marks the iOS 16 fixture unsupported', async () => {
    const bridge = new MockBridge(loadFixture(dir, 'iphone-ios16'))
    const [device] = await bridge.listDevices()
    expect(device).toMatchObject({ osVersion: '16.7', state: 'unsupported-os' })
  })

  it('rejects path tricks in the fixture name', () => {
    expect(() => loadFixture(dir, '../plan')).toThrow('Bad fixture name')
  })

  it('lists no devices without a fixture', async () => {
    expect(await new MockBridge().listDevices()).toEqual([])
  })
})

describe('MockBridge.listApps', () => {
  it('lists every home screen app once, Apple apps as not removable', async () => {
    const f = loadFixture(dir, 'iphone-basic')
    const apps = await new MockBridge(f).listApps(f.device.udid)
    expect(new Set(apps.map((a) => a.bundleId)).size).toBe(apps.length)
    expect(apps.length).toBeGreaterThan(5)
    for (const a of apps) expect(a.removable).toBe(!a.bundleId.startsWith('com.apple.'))
  })
})

describe('MockBridge with several devices', () => {
  const phone = loadFixture(dir, 'iphone-basic')
  const ipad = loadFixture(dir, 'ipad-basic')

  it('lists them all, and keeps what is written to one away from the other', async () => {
    const bridge = new MockBridge([phone, ipad])
    expect((await bridge.listDevices()).map((d) => d.deviceClass)).toEqual(['iPhone', 'iPad'])
    await bridge.setIconState(ipad.device.udid, [[], []])
    expect(await bridge.getIconState(ipad.device.udid)).toEqual([[], []])
    expect(await bridge.getIconState(phone.device.udid)).toEqual(phone.rawState)
    await expect(bridge.getIconState('NOPE-1')).rejects.toThrow('Unknown device')
  })

  it('has iPad fixtures with 30 items on a full page, and widgets sized for 6 columns', () => {
    const wide = loadFixture(dir, 'ipad-widgets')
    expect(wide.device).toMatchObject({ deviceClass: 'iPad', state: 'ready' })
    const [, page1, page2, page3] = wide.rawState
    expect([page1!.length, page2!.length, page3!.length]).toEqual([23, 15, 30]) // + widget cells = 30
    expect(page1!.find((i) => 'gridSize' in i)).toMatchObject({ gridSize: 'medium' })
    expect(page2!.find((i) => 'gridSize' in i)).toMatchObject({ gridSize: 'large' })
  })
})
