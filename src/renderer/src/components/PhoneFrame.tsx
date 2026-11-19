import type { ReactNode } from 'react'
import type { Device } from '@shared/types'
import s from './phone.module.css'

export type FrameKind = Device['deviceClass']

// A device's screen in points, plus the bezel. Everything inside is laid out at 1:1 and scaled.
// The iPad is drawn in landscape, like its 6 × 5 icon grid.
// TODO(iPad): these sizes are a guess; compare with a real iPad when one is available.
const FRAMES = {
  iPhone: { width: 402, height: 874, bezel: 12 },
  iPad: { width: 1180, height: 820, bezel: 18 }
} as const

export function frameSize(kind: FrameKind): { width: number; height: number } {
  const { width, height, bezel } = FRAMES[kind]
  return { width: width + bezel * 2, height: height + bezel * 2 }
}

interface Props {
  zoom: number
  kind?: FrameKind
  children: ReactNode
}

export function PhoneFrame({ zoom, kind = 'iPhone', children }: Props) {
  const { width, height, bezel } = FRAMES[kind]
  const outer = frameSize(kind)
  return (
    <div className={s.sizer} style={{ width: outer.width * zoom, height: outer.height * zoom }}>
      <div
        className={kind === 'iPad' ? `${s.device} ${s.ipad}` : s.device}
        style={{
          width: outer.width,
          height: outer.height,
          padding: bezel,
          transform: `scale(${zoom})`
        }}
      >
        <div className={s.screen} data-frame={kind} style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  )
}
