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
