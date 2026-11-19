import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Dock } from '../components/Dock'
import { PageGrid } from '../components/PageGrid'
import { PhoneScreen, screenSize } from '../components/PhoneFrame'
import { useDevices, useLayout } from '../state/queries'

// What main draws in an invisible window to export pictures or a PDF (see ElectronPageRenderer). It reads
// its job from the address (?udid=…&pages=1,2&wallpaper=0), draws those pages at 1:1, and says it is done by
// setting data-export-ready on the body: "1" when the pages and their icons are drawn, or what went wrong.
export function ExportPrint() {
  const [query] = useSearchParams()
  const udid = query.get('udid') ?? ''
  const numbers = (query.get('pages') ?? '1').split(',').map(Number)
  const plain = query.get('wallpaper') === '0'
  const layout = useLayout(udid)
  const device = useDevices().data?.find((d) => d.udid === udid)
  const kind = device?.deviceClass ?? 'iPhone'
  const grid = layout.data?.layout
  const ready = !!grid && !!device

  useEffect(() => {
    if (layout.isError) document.body.dataset.exportReady = 'could not read the home screen'
    if (!ready) return
    let stop = false
    const images = [...document.images].map((img) =>
      img.complete ? null : new Promise((done) => (img.onload = img.onerror = done))
    )
    void Promise.all(images).then(
      // Two frames: a failed icon swaps itself for a letter tile.
      () =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!stop) document.body.dataset.exportReady = '1'
          })
        )
    )
    return () => {
      stop = true
    }
  }, [ready, layout.isError])

  const size = screenSize(kind)
  return (
    <div style={{ background: '#fff' }}>
      {/* One screen per PDF page: no margins, no scaling. */}
      <style>{`@page { size: ${size.width}px ${size.height}px; margin: 0 } html, body { height: auto; background: #fff }`}</style>
      {grid &&
        numbers.map((n) => (
          <div key={n} style={{ breakAfter: 'page', width: size.width, height: size.height }}>
            <PhoneScreen kind={kind} plain={plain}>
              <PageGrid items={grid.pages[n - 1] ?? []} grid={grid.grid} udid={udid} />
              <Dock items={grid.dock} udid={udid} />
            </PhoneScreen>
          </div>
        ))}
    </div>
  )
}
