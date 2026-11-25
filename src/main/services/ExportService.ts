import { access, mkdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { Broadcast } from '@shared/ipc-contract'
import type { Device, ExportRequest, ExportResult } from '@shared/types'
import type { DeviceBridge } from './bridge/DeviceBridge'
import type { Logger } from './bridge/SidecarBridge'

// Draws home screen pages. Pages are 1-based. The Electron one lives in ElectronPageRenderer.
export interface PageRenderer {
  png(job: { udid: string; page: number; wallpaper: boolean }): Promise<Buffer>
  pdf(job: { udid: string; pages: number[]; wallpaper: boolean }): Promise<Buffer>
  close(): void
}

interface Deps {
  bridge: DeviceBridge
  renderer: PageRenderer
  // Asks where to save; undefined when the person cancels. The macOS save dialog in the app.
  choose: (defaultName: string, ext: 'png' | 'pdf' | 'csv') => Promise<string | undefined>
  // Shows a file in Finder: shell.showItemInFolder in the app.
  reveal: (path: string) => void
  broadcast: Broadcast
  log: Logger
}

// The byte order mark makes Excel read accents right; Numbers ignores it.
const BOM = String.fromCharCode(0xfeff)
const SAVE_FAILED = 'Couldn’t save the file. Check you have permission to write to this folder.'
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// "Sam's iPhone – Home Screen.pdf": a device name can hold characters a file name can't.
// The set Windows refuses, which covers the Mac's.
const safeName = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Device'

// `X – page 2.png`, or the first free `X – page 2 (2).png`: a page file is never overwritten.
async function freePath(path: string): Promise<string> {
  const ext = extname(path)
  const stem = path.slice(0, path.length - ext.length)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? path : `${stem} (${n})${ext}`
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
}

// Writes the layout out as PNG pages, one PDF, or the app list as CSV. Never throws: a failure or a cancelled
// dialog is a result, and a saved file is announced with `export:saved`.
export class ExportService {
  private readonly saved = new Set<string>()

  constructor(private readonly deps: Deps) {}

  async run(request: ExportRequest): Promise<ExportResult> {
    const { renderer, broadcast, log } = this.deps
    try {
      const device = (await this.deps.bridge.listDevices()).find((d) => d.udid === request.udid)
      if (!device) return { ok: false, canceled: false, message: 'The device isn’t connected.' }
      const paths =
        request.format === 'csv'
          ? await this.csv(device, request.content)
          : await this.pages(device, request)
      if (!paths) return { ok: false, canceled: true, message: 'Export canceled.' }
      for (const path of paths) this.saved.add(path)
      log.info(`export: ${request.format} -> ${paths.length} file(s)`)
      broadcast('export:saved', paths[0]!)
      return { ok: true, paths }
    } catch (err) {
      log.error('export failed:', reason(err))
      return { ok: false, canceled: false, message: SAVE_FAILED }
    } finally {
      renderer.close()
    }
  }

  // Only a file this service just wrote can be shown in Finder.
  reveal(path: string): void {
    if (this.saved.has(path)) this.deps.reveal(path)
  }

  private async csv(device: Device, content: string): Promise<string[] | undefined> {
    const file = await this.deps.choose(`${safeName(device.name)} – Apps.csv`, 'csv')
    if (!file) return undefined
    await writeFileAtomic(file, `${BOM}${content}`)
    return [file]
  }

  private async pages(
    device: Device,
    request: Extract<ExportRequest, { format: 'png' | 'pdf' }>
  ): Promise<string[] | undefined> {
    const { bridge, renderer, broadcast } = this.deps
    const total = normalize(await bridge.getIconState(device.udid), gridFor(device.deviceClass))
      .pages.length
    const pages =
      request.page === 'all' ? Array.from({ length: total }, (_, i) => i + 1) : [request.page]
    if (pages.length === 0 || pages.some((p) => p > total)) throw new Error('No such page.')

    const file = await this.deps.choose(
      `${safeName(device.name)} – Home Screen.${request.format}`,
      request.format
    )
    if (!file) return undefined
    await mkdir(dirname(file), { recursive: true })
    broadcast('export:progress', { done: 0, total: pages.length })

    if (request.format === 'pdf') {
      await writeFileAtomic(
        file,
        await renderer.pdf({ udid: device.udid, pages, wallpaper: request.wallpaper })
      )
      return [file]
    }
    // One picture: the file chosen. Several: "<name> – page N.png" beside it.
    const stem = join(dirname(file), basename(file, extname(file)))
    const written: string[] = []
    for (const [i, page] of pages.entries()) {
      const png = await renderer.png({ udid: device.udid, page, wallpaper: request.wallpaper })
      const target = pages.length === 1 ? file : await freePath(`${stem} – page ${page}.png`)
      await writeFileAtomic(target, png)
      written.push(target)
      broadcast('export:progress', { done: i + 1, total: pages.length })
    }
    return written
  }
}
