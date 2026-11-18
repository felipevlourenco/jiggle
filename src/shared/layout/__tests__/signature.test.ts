import { describe, expect, it } from 'vitest'
import type { RawIconState } from '../../types'
import { layoutSignature } from '../signature'

const app = (id: string, extra = {}) => ({ bundleIdentifier: id, displayName: id, ...extra })

describe('layoutSignature', () => {
  const state: RawIconState = [
    [app('dock')],
    [app('a'), app('b')],
    [{ gridSize: 'medium' }, app('c')]
  ]

  it('ignores fields iOS changes by itself, like versions and icon dates', () => {
    const updated: RawIconState = [
      [app('dock', { bundleVersion: '2' })],
      [app('a', { iconModDate: 'new' }), app('b')],
      [{ gridSize: 'medium', extra: true }, app('c')]
    ]
    expect(layoutSignature(updated)).toBe(layoutSignature(state))
  })

  it('differs when an icon moves, changes page, or a folder changes', () => {
    const swapped: RawIconState = [[app('dock')], [app('b'), app('a')], state[2]!]
    const otherPage: RawIconState = [
      [app('dock')],
      [app('a')],
      [{ gridSize: 'medium' }, app('c'), app('b')]
    ]
    expect(layoutSignature(swapped)).not.toBe(layoutSignature(state))
    expect(layoutSignature(otherPage)).not.toBe(layoutSignature(state))
    const folder = (names: string[]) => ({
      listType: 'folder',
      displayName: 'F',
      iconLists: [names.map((n) => app(n))]
    })
    expect(layoutSignature([[], [folder(['x', 'y'])]])).not.toBe(
      layoutSignature([[], [folder(['y', 'x'])]])
    )
  })

  it('ignores empty pages', () => {
    expect(layoutSignature([[app('dock')], [app('a')], []])).toBe(
      layoutSignature([[app('dock')], [app('a')]])
    )
  })

  it('treats an icon that only has a displayIdentifier like an app', () => {
    const odd: RawIconState = [[], [{ displayIdentifier: 'x', displayName: 'X' }]]
    expect(layoutSignature(odd)).toBe(JSON.stringify([[], ['x']]))
  })
})
