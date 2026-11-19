import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ExportRequest } from '@shared/types'
import { MockBridge, loadFixture } from '../bridge/MockBridge'
import { ExportService, type PageRenderer } from '../ExportService'

const fixture = loadFixture(join(__dirname, '../../../../tests/fixtures'), 'iphone-widgets')
const udid = fixture.device.udid
const pages = fixture.rawState.length - 1
const silent = { debug() {}, info() {}, warn() {}, error() {} }

// `choose` gets the default file name and a fresh folder; undefined cancels the dialog.
function setup(
  choose: (name: string, dir: string) => string | undefined = (name, dir) => join(dir, name)
) {
  const dir = mkdtempSync(join(tmpdir(), 'jiggle-export-'))
  const renderer: PageRenderer = {
    png: vi.fn(async ({ page }) => Buffer.from(`png ${page}`)),
    pdf: vi.fn(async ({ pages }) => Buffer.from(`pdf ${pages.join(',')}`)),
    close: vi.fn()
  }
  const broadcast = vi.fn()
  const reveal = vi.fn()
  const service = new ExportService({
    bridge: new MockBridge(fixture),
    renderer,
    choose: async (name) => choose(name, dir),
    reveal,
    broadcast,
    log: silent
  })
  return { dir, renderer, broadcast, reveal, service, files: () => readdirSync(dir).sort() }
}
const png = (page: 'all' | number, wallpaper = true): ExportRequest => ({
  format: 'png',
  udid,
  page,
  wallpaper
})

describe('ExportService', () => {
  it('PNG, all pages: one file per page beside the chosen name, with progress, then announces it', async () => {
    const t = setup()
    const result = await t.service.run(png('all'))
    expect(result).toMatchObject({ ok: true })
    const base = "Sam's iPhone – Home Screen"
    expect(t.files()).toEqual(
      Array.from({ length: pages }, (_, i) => `${base} – page ${i + 1}.png`).sort()
    )
    expect(readFileSync(join(t.dir, `${base} – page 2.png`), 'utf8')).toBe('png 2')
    const progress = t.broadcast.mock.calls
      .filter(([e]) => e === 'export:progress')
      .map(([, p]) => p)
    expect(progress[0]).toEqual({ done: 0, total: pages })
    expect(progress.at(-1)).toEqual({ done: pages, total: pages })
    expect(t.broadcast).toHaveBeenCalledWith('export:saved', join(t.dir, `${base} – page 1.png`))
    expect(t.renderer.close).toHaveBeenCalled()
  })

  it('PNG, one page: exactly the file that was chosen; the wallpaper choice reaches the renderer', async () => {
    const t = setup()
    await t.service.run(png(3, false))
    expect(t.files()).toEqual(["Sam's iPhone – Home Screen.png"])
    expect(t.renderer.png).toHaveBeenCalledWith({ udid, page: 3, wallpaper: false })
  })

  it('never overwrites a page file that is already there', async () => {
    const t = setup()
    const taken = join(t.dir, "Sam's iPhone – Home Screen – page 1.png")
    writeFileSync(taken, 'mine')
    await t.service.run(png('all'))
    expect(readFileSync(taken, 'utf8')).toBe('mine')
    expect(t.files()).toContain("Sam's iPhone – Home Screen – page 1 (2).png")
  })

  it('PDF: one file with every page', async () => {
    const t = setup()
    const result = await t.service.run({ format: 'pdf', udid, page: 'all', wallpaper: true })
    expect(result).toMatchObject({ ok: true })
    expect(t.files()).toEqual(["Sam's iPhone – Home Screen.pdf"])
    expect(readFileSync(join(t.dir, t.files()[0]!), 'utf8')).toBe(
      `pdf ${Array.from({ length: pages }, (_, i) => i + 1).join(',')}`
    )
  })

  it('CSV: the window’s text, with a byte order mark for Excel', async () => {
    const t = setup()
    await t.service.run({ format: 'csv', udid, content: 'Name\r\nMail\r\n' })
    expect(t.files()).toEqual(["Sam's iPhone – Apps.csv"])
    expect(readFileSync(join(t.dir, t.files()[0]!), 'utf8')).toBe('﻿Name\r\nMail\r\n')
  })

  it('a cancelled save dialog writes nothing and is not an error', async () => {
    const t = setup(() => undefined)
    const result = await t.service.run(png('all'))
    expect(result).toMatchObject({ ok: false, canceled: true })
    expect(t.files()).toEqual([])
    expect(t.renderer.png).not.toHaveBeenCalled()
    expect(t.broadcast).not.toHaveBeenCalledWith('export:saved', expect.anything())
    expect(t.renderer.close).toHaveBeenCalled()
  })

  it('refuses a page that does not exist, before asking where to save', async () => {
    const choose = vi.fn(() => 'x')
    const t = setup(choose)
    const result = await t.service.run(png(pages + 1))
    expect(result).toMatchObject({ ok: false, canceled: false })
    expect(choose).not.toHaveBeenCalled()
  })

  it('says to check permissions when the file can’t be written, and still closes the renderer', async () => {
    const t = setup((name, dir) => {
      writeFileSync(join(dir, 'blocked'), 'a file where a folder should be')
      return join(dir, 'blocked', 'file', name)
    })
    const result = await t.service.run({ format: 'csv', udid, content: 'x' })
    expect(result).toEqual({
      ok: false,
      canceled: false,
      message: 'Couldn’t save the file. Check you have permission to write to this folder.'
    })
    expect(t.renderer.close).toHaveBeenCalled()
  })

  it('an unknown device is a result, not a throw', async () => {
    const t = setup()
    expect(await t.service.run({ ...png(1), udid: 'NOPE-1' })).toMatchObject({ ok: false })
  })

  it('shows in Finder only what it wrote', async () => {
    const t = setup()
    const result = await t.service.run(png(1))
    const [path] = result.ok ? result.paths : []
    t.service.reveal('/etc/passwd')
    expect(t.reveal).not.toHaveBeenCalled()
    t.service.reveal(path!)
    expect(t.reveal).toHaveBeenCalledWith(path)
  })

  it('keeps a device name from making a path', async () => {
    const t = setup()
    const service = new ExportService({
      bridge: new MockBridge({ ...fixture, device: { ...fixture.device, name: 'A/B: C' } }),
      renderer: { png: async () => Buffer.alloc(1), pdf: async () => Buffer.alloc(1), close() {} },
      choose: async (name) => join(t.dir, name),
      reveal() {},
      broadcast: vi.fn(),
      log: silent
    })
    await service.run(png(1))
    expect(t.files()).toEqual(['A-B- C – Home Screen.png'])
  })
})
