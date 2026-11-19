import type { BrowserWindow } from 'electron'
import { createExportWindow, loadRenderer } from '../windows'
import type { PageRenderer } from './ExportService'

const READY_TIMEOUT_MS = 20_000

// Draws the export route (ExportPrint.tsx) in an invisible window and takes it as a picture or a PDF.
// The window is reused for every page of one export and closed with `close()`.
export class ElectronPageRenderer implements PageRenderer {
  private win: BrowserWindow | undefined

  async png({ udid, page, wallpaper }: { udid: string; page: number; wallpaper: boolean }) {
    const win = await this.show({ udid, pages: String(page), wallpaper })
    const r = (await win.webContents.executeJavaScript(
      `(() => { const r = document.querySelector('[data-export-page]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: window.devicePixelRatio } })()`
    )) as { x: number; y: number; width: number; height: number; scale: number }
    // Through the debugger, not capturePage: capturePage only sees the visible window, which a small display
    // (a CI runner) crops, while this draws the whole rectangle whatever the window's size.
    const dbg = win.webContents.debugger
    if (!dbg.isAttached()) dbg.attach('1.3')
    const shot = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: r.scale }
    })) as { data: string }
    return Buffer.from(shot.data, 'base64')
  }

  async pdf({ udid, pages, wallpaper }: { udid: string; pages: number[]; wallpaper: boolean }) {
    const win = await this.show({ udid, pages: pages.join(','), wallpaper })
    // The route sets @page to one screen, so every home screen page is one PDF page.
    return win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = undefined
  }

  private async show(q: {
    udid: string
    pages: string
    wallpaper: boolean
  }): Promise<BrowserWindow> {
    if (!this.win || this.win.isDestroyed()) this.win = createExportWindow()
    const params = new URLSearchParams({
      udid: q.udid,
      pages: q.pages,
      wallpaper: q.wallpaper ? '1' : '0'
    })
    await loadRenderer(this.win, `/export-print?${params}`)
    const deadline = Date.now() + READY_TIMEOUT_MS
    for (;;) {
      const state = (await this.win.webContents.executeJavaScript(
        'document.body.dataset.exportReady ?? ""'
      )) as string
      if (state === '1') return this.win
      if (state) throw new Error(`The page could not be drawn: ${state}`)
      if (Date.now() > deadline) throw new Error('Timed out drawing the page.')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}
