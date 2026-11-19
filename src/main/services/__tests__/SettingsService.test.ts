import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SettingsService } from '../SettingsService'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const dir = () => mkdtempSync(join(tmpdir(), 'jiggle-settings-'))

describe('SettingsService', () => {
  it('starts with the defaults, the storefront from the Mac', () => {
    expect(new SettingsService(dir(), silent, 'br').get()).toEqual({
      theme: 'system',
      storefront: 'br',
      backupRetention: 50,
      categoryLookupEnabled: true,
      updateCheckEnabled: true,
      wifiEnabled: false
    })
  })

  it('saves changes, tells the app, and remembers them after a relaunch', async () => {
    const root = dir()
    const onChange = vi.fn()
    await new SettingsService(root, silent, 'nl', onChange).set({
      backupRetention: 10,
      theme: 'dark'
    })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ backupRetention: 10 }))
    const relaunched = new SettingsService(root, silent, 'nl')
    expect(relaunched.get()).toMatchObject({ backupRetention: 10, theme: 'dark' })
    expect(JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')).backupRetention).toBe(10)
  })

  it('rejects an invalid value and keeps the rest', async () => {
    const service = new SettingsService(dir(), silent, 'nl')
    await expect(service.set({ storefront: 'NLD' })).rejects.toThrow()
    expect(service.get().storefront).toBe('nl')
  })

  it('ignores a damaged file, or one bad key, without losing the other settings', () => {
    const root = dir()
    writeFileSync(join(root, 'settings.json'), '{ nope')
    expect(new SettingsService(root, silent, 'nl').get().backupRetention).toBe(50)
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({ backupRetention: 'lots', theme: 'dark' })
    )
    expect(new SettingsService(root, silent, 'nl').get()).toMatchObject({
      backupRetention: 50,
      theme: 'dark'
    })
  })
})
