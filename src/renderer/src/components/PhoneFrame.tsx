import type { ReactNode } from 'react'
import s from './phone.module.css'

// iPhone-sized screen in points, plus the bezel. Everything inside is laid out at 1:1 and scaled.
export const PHONE = { width: 402, height: 874, bezel: 12 }
export const FRAME_WIDTH = PHONE.width + PHONE.bezel * 2
export const FRAME_HEIGHT = PHONE.height + PHONE.bezel * 2

interface Props {
  zoom: number
  children: ReactNode
}

export function PhoneFrame({ zoom, children }: Props) {
  return (
    <div className={s.sizer} style={{ width: FRAME_WIDTH * zoom, height: FRAME_HEIGHT * zoom }}>
      <div
        className={s.device}
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${zoom})` }}
      >
        <div className={s.screen}>{children}</div>
      </div>
    </div>
  )
}
