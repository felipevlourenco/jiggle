// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { gridFor } from '@shared/layout/grid'
import { normalize } from '@shared/layout/normalize'
import type { AppItem, FolderItem, RawIconState } from '@shared/types'
import { Dock } from '../Dock'
import { IconTile } from '../IconTile'
import { FolderTile } from '../FolderTile'
import { PageGrid } from '../PageGrid'

afterEach(cleanup)

const raw: RawIconState = JSON.parse(
  readFileSync(join(__dirname, '../../../../../tests/fixtures/iphone-widgets.json'), 'utf8')
).rawState
const layout = normalize(raw, gridFor('iPhone'))
const UDID = '00008130-000A1B2C3D4E0002'

describe('PageGrid on the iphone-widgets fixture', () => {
  it('matches the snapshot of the two widget pages', () => {
    const { container } = render(
      <>
        <PageGrid items={layout.pages[0]!} grid={layout.grid} udid={UDID} />
        <PageGrid items={layout.pages[1]!} grid={layout.grid} udid={UDID} />
      </>
    )
    expect(container).toMatchSnapshot()
  })

  it('draws one full-width, two-row widget placeholder first, then 16 apps or folders', () => {
    const { container } = render(
      <PageGrid items={layout.pages[0]!} grid={layout.grid} udid={UDID} />
    )
    const cells = [...container.querySelectorAll<HTMLElement>('[data-testid="page"] > div')]
    expect(cells).toHaveLength(17)
    expect(cells[0]!.style.gridColumn).toBe('1 / span 4')
    expect(cells[0]!.style.gridRow).toBe('1 / span 2')
    expect(cells[0]!.querySelector('[data-kind="widget"]')).not.toBeNull()
    expect(
      cells.slice(1).every((c) => c.querySelector('[data-kind="app"], [data-kind="folder"]'))
    ).toBe(true)
    expect(screen.getAllByText('Widget')).toHaveLength(1)
  })
})

describe('tiles', () => {
  const firstFolder = layout.pages.flat().find((i): i is FolderItem => i.kind === 'folder')!

  it('a folder shows its name and at most 9 mini icons', () => {
    const { container } = render(<FolderTile udid={UDID} folder={firstFolder} />)
    expect(screen.getByText(firstFolder.name)).toBeTruthy()
    const minis = container.querySelectorAll('img, [aria-hidden="true"]')
    expect(minis.length).toBe(Math.min(9, firstFolder.pages[0]!.length))
  })

  it('falls back to a letter tile when the icon fails to load', () => {
    const app: AppItem = { kind: 'app', id: 'x', bundleId: 'com.x.app', name: 'Zed', raw: {} }
    const { container } = render(<IconTile udid={UDID} app={app} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(`jiggle-icon://icons/${UDID}/com.x.app.png`)
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe('Z')
  })

  it('the dock has no labels', () => {
    render(<Dock items={layout.dock} udid={UDID} />)
    const firstApp = layout.dock[0] as AppItem
    expect(screen.queryByText(firstApp.name)).toBeNull()
  })
})
