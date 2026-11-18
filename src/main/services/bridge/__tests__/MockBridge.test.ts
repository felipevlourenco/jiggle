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
