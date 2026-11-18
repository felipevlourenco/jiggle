import { describe, expect, it } from 'vitest'
import type { AppItem, Layout } from '../../types'
import { appLocations } from '../locations'

const app = (bundleId: string): AppItem => ({
  kind: 'app',
  id: bundleId,
  bundleId,
  name: bundleId.toUpperCase(),
  raw: {}
})

describe('appLocations', () => {
  it('says where each app sits: dock, page, or folder and its page', () => {
    const layout: Layout = {
      grid: { columns: 4, rows: 6, dockMax: 4 },
      dock: [app('phone')],
      pages: [
        [app('mail')],
        [{ kind: 'widget', id: 'w', raw: {} }],
        [{ kind: 'folder', id: 'f', name: 'Travel', pages: [[app('maps')]], raw: {} }]
      ]
    }
    const got = appLocations(layout)
    expect([...got]).toEqual([
      ['phone', { name: 'PHONE', location: 'Dock' }],
      ['mail', { name: 'MAIL', location: 'Page 1' }],
      ['maps', { name: 'MAPS', location: "Folder 'Travel' · Page 3" }]
    ])
    expect(got.has('news')).toBe(false) // not placed: App Library
  })
})
