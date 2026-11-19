// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { frameSize, PhoneFrame } from '../PhoneFrame'

afterEach(cleanup)

describe('PhoneFrame', () => {
  it('draws the iPhone in portrait and the iPad in landscape, at the zoom it is given', () => {
    expect(frameSize('iPhone')).toEqual({ width: 426, height: 898 })
    const { width, height } = frameSize('iPad')
    expect(width).toBeGreaterThan(height)

    const { container } = render(
      <PhoneFrame zoom={0.5} kind="iPad">
        <span>hi</span>
      </PhoneFrame>
    )
    const screen = container.querySelector<HTMLElement>('[data-frame="iPad"]')!
    expect([screen.style.width, screen.style.height]).toEqual(['1180px', '820px'])
    const sizer = container.firstElementChild as HTMLElement
    expect([sizer.style.width, sizer.style.height]).toEqual([`${width / 2}px`, `${height / 2}px`])
  })

  it('is an iPhone unless told otherwise', () => {
    const { container } = render(<PhoneFrame zoom={1}>x</PhoneFrame>)
    expect(container.querySelector('[data-frame="iPhone"]')).not.toBeNull()
  })
})
