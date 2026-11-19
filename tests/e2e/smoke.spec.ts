import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type Page } from '@playwright/test'

// Runs in the page, where the DOM's getComputedStyle exists (the tests themselves have no DOM types).
declare function getComputedStyle(el: unknown): { getPropertyValue(name: string): string }

const launch = (env: Record<string, string> = {}) =>
  electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JIGGLE_MOCK_DEVICE: 'none',
      JIGGLE_NO_LOOKUP: '1',
      JIGGLE_USER_DATA: mkdtempSync(join(tmpdir(), 'jiggle-e2e-')), // never the real caches
      ...env
    }
  })

test('app shell loads with sidebar, routes and no Node in the renderer', async () => {
  const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
  const win = await app.firstWindow()

  const sizes = await app.evaluate(({ BrowserWindow }) => {
    const b = BrowserWindow.getAllWindows()[0]!
    return { size: b.getSize(), min: b.getMinimumSize() }
  })
  expect(sizes).toEqual({ size: [1280, 800], min: [960, 640] })

  for (const label of ['Home Screen', 'Apps', 'Organize', 'History', 'Cleanup']) {
    await win.getByRole('link', { name: label }).click()
    await expect(win.getByRole('heading', { name: label })).toBeVisible()
  }

  expect(await win.evaluate('typeof require')).toBe('undefined')
  await app.close()
})

test('with no device: Connect screen, No device header, sidebar disabled', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  await expect(win.getByText('No device')).toBeVisible()
  await expect(win.getByRole('heading', { name: 'Connect your iPhone' })).toBeVisible()
  await expect(win.getByText('Tap Trust and enter your passcode')).toBeVisible()
  await expect(win.getByRole('link', { name: 'Apps' })).toHaveCount(0)
  await app.close()
})

test('a trusted device opens Home Screen', async () => {
  const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
  const win = await app.firstWindow()
  await expect(win.getByRole('heading', { name: 'Home Screen' })).toBeVisible()
  await expect(win.getByTestId('device-card')).toContainText("Sam's iPhone")
  await expect(win.getByTestId('device-card')).toContainText('iOS 26.1')
  await app.close()
})

for (const [fixture, title] of [
  ['iphone-locked', "Unlock Sam's iPhone to continue"],
  ['iphone-trust-pending', 'Tap Trust on your iPhone'],
  ['iphone-trust-declined', "Jiggle wasn't trusted"]
] as const) {
  test(`Connect explains ${fixture}`, async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: fixture })
    const win = await app.firstWindow()
    await expect(win.getByRole('heading', { name: title })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Try Again' })).toHaveCount(
      fixture === 'iphone-trust-declined' ? 1 : 0
    )
    await app.close()
  })
}

test('an unsupported iOS needs a click to continue in read-only mode', async () => {
  const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-ios16' })
  const win = await app.firstWindow()
  await expect(
    win.getByRole('heading', { name: "iOS 16.7 isn't supported for changes" })
  ).toBeVisible()
  await win.getByRole('button', { name: 'Continue in Read‑Only Mode' }).click()
  await expect(win.getByRole('heading', { name: 'Home Screen' })).toBeVisible()
  await app.close()
})

test('shows the mock device in the sidebar header', async () => {
  const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
  const win = await app.firstWindow()
  await expect(win.getByTestId('device-card')).toContainText("Sam's iPhone")
  await expect(win.getByTestId('device-card')).toContainText('iOS 26.1')
  await app.close()
})

test('window.jiggle exposes only the API groups and rejects bad payloads', async () => {
  const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
  const win = await app.firstWindow()
  expect(await win.evaluate('Object.keys(window.jiggle).sort()')).toEqual([
    'apply',
    'apps',
    'device',
    'layout',
    'pins',
    'settings',
    'sidecar',
    'snapshots',
    'toast'
  ])
  await expect(win.evaluate('window.jiggle.layout.get(123)')).rejects.toThrow(
    /Invalid arguments for layout:get/
  )
  // the app keeps working after the rejection
  await expect(win.getByTestId('device-card')).toContainText("Sam's iPhone")
  await expect(win.getByTestId('device-card')).toContainText('iOS 26.1')
  await app.close()
})

test.describe('Home Screen preview', () => {
  // retrying assertion: React updates a beat after the click, key press or wheel event
  const pageIs = (win: Page, n: number) =>
    expect(
      win.getByRole('group', { name: 'Pages' }).locator('[aria-current="page"]')
    ).toHaveAttribute('aria-label', `Page ${n}`)

  test('shows pages, a widget placeholder, and navigates every way', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-widgets' })
    const win = await app.firstWindow()
    await expect(win.getByText(/\d+ apps · 6 pages · 2 widgets/)).toBeVisible()

    const dots = win.getByRole('group', { name: 'Pages' }).getByRole('button')
    await expect(dots).toHaveCount(6)

    // page 1 has the medium widget; the dock has icons without labels
    await expect(win.getByText('Widget', { exact: true })).toHaveCount(1)
    await expect(win.getByTestId('dock').locator('[data-kind="app"]')).toHaveCount(4)
    await pageIs(win, 1)
    await expect(win.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await win.getByRole('button', { name: 'Next page' }).click()
    await pageIs(win, 2)
    await win.keyboard.press('Meta+ArrowRight')
    await pageIs(win, 3)
    await win.keyboard.press('Meta+ArrowLeft')
    await pageIs(win, 2)
    await dots.nth(5).click()
    await pageIs(win, 6)
    await expect(win.getByRole('button', { name: 'Next page' })).toBeDisabled()

    await app.close()
  })

  test('a trackpad swipe turns one page, even with inertia events after it', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-widgets' })
    const win = await app.firstWindow()
    const dots = win.getByRole('group', { name: 'Pages' })
    await expect(dots).toBeVisible()

    await win.mouse.move(640, 400)
    await win.mouse.wheel(80, 0)
    await win.mouse.wheel(60, 0) // same swipe: must not skip a page
    await pageIs(win, 2)
    await win.waitForTimeout(300) // wheel events stopped: the next swipe counts
    await win.mouse.wheel(-80, 0)
    await pageIs(win, 1)
    await app.close()
  })

  test('the zoom slider scales the phone', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-widgets' })
    const win = await app.firstWindow()
    const width = async () => (await win.getByTestId('dock').boundingBox())!.width
    await expect(win.getByTestId('dock')).toBeVisible()
    const before = await width()
    await win.getByRole('slider').focus()
    await win.keyboard.press('ArrowLeft', { delay: 5 })
    for (let i = 0; i < 14; i++) await win.keyboard.press('ArrowLeft')
    expect(await width()).toBeLessThan(before * 0.85)
    await app.close()
  })
})

test.describe('Apps', () => {
  test('lists apps, filters by search, sorts by column, shows each app’s location', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Apps' }).click()

    const rows = win.getByRole('row')
    await expect(win.getByText(/^\d+ apps$/)).toBeVisible()
    const all = await rows.count()
    expect(all).toBeGreaterThan(50)
    // Apple apps are "Apple" without a lookup; others are Unknown while lookups are off
    await expect(win.getByRole('row', { name: /Messages/ })).toContainText('Apple')
    await expect(win.getByRole('row', { name: /Spotify/ })).toContainText('Unknown')

    // the toolbar drags the window; its controls must not be part of the drag region
    expect(
      await win
        .getByRole('searchbox', { name: 'Search apps' })

        .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
    ).toBe('no-drag')
    await win.getByRole('searchbox', { name: 'Search apps' }).fill('spotify')
    await expect(rows).toHaveCount(2) // header + Spotify
    await win.getByRole('searchbox', { name: 'Search apps' }).fill('')
    await expect(rows).toHaveCount(all)

    const category = win.getByRole('columnheader', { name: /Category/ })
    await category.getByRole('button').click()
    await expect(category).toHaveAttribute('aria-sort', 'ascending')
    await category.getByRole('button').click()
    await expect(category).toHaveAttribute('aria-sort', 'descending')

    await expect(win.getByRole('row', { name: /Phone/ })).toContainText('Dock')
    await app.close()
  })
})

test.describe('Organize', () => {
  test('previews A–Z before/after without applying, and the pager moves both frames', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Organize' }).click()

    await expect(win.getByTestId('summary')).toHaveText(/^\d+ of \d+ apps will move/)
    const before = win.getByRole('figure', { name: 'Before' })
    const after = win.getByRole('figure', { name: 'After' })
    await expect(before).toBeVisible()
    await expect(after).toBeVisible()
    // coral dots only on After; the messy fixture is not sorted, so something moves
    expect(await before.locator('[data-moved]').count()).toBe(0)
    await expect(after.locator('[data-moved]').first()).toBeVisible()

    await win.getByRole('radio', { name: /Category/ }).click()
    await expect(win.getByRole('radio', { name: /Category/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await win.getByRole('radio', { name: /Color/ }).click()
    await expect(win.getByRole('radio', { name: /Color/ })).toHaveAttribute('aria-checked', 'true')
    await expect(win.getByTestId('summary')).toHaveText(/^\d+ of \d+ apps will move/)
    await win.getByRole('radio', { name: /Category/ }).click()
    await win.getByRole('radio', { name: 'Sort around widgets' }).click()
    await expect(win.getByRole('radio', { name: 'Sort around widgets' })).toHaveAttribute(
      'aria-checked',
      'true'
    )

    // one pager drives both frames
    await win.getByRole('button', { name: 'Next page' }).click()
    await expect(
      win.getByRole('group', { name: 'Pages' }).locator('[aria-current="page"]')
    ).toHaveAttribute('aria-label', 'Page 2')

    // the sheet asks first; cancelling writes nothing
    expect(
      await win
        .getByRole('button', { name: 'Apply to iPhone' })

        .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
    ).toBe('no-drag')
    await win.getByRole('button', { name: 'Apply to iPhone' }).click()
    await expect(win.getByRole('dialog', { name: /Apply Category to Sam/ })).toBeVisible()
    await win.getByRole('button', { name: 'Cancel' }).click()
    await expect(win.getByRole('dialog')).toHaveCount(0)
    await app.close()
  })

  test('read-only mode turns Apply off', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-ios16' })
    const win = await app.firstWindow()
    await win.getByRole('button', { name: /Continue/ }).click()
    await win.getByRole('link', { name: 'Organize' }).click()
    await expect(win.getByRole('button', { name: 'Apply to iPhone' })).toBeDisabled()
    await expect(win.getByText(/Apply is turned off for iOS 16/)).toBeVisible()
    await app.close()
  })
})

test.describe('History', () => {
  test('Back Up Now (button and menu) lists backups that survive a relaunch, even with no phone', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'jiggle-e2e-history-'))
    let app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_USER_DATA: userData })
    let win = await app.firstWindow()

    // the Home Screen strip has the counts a backup should show
    const strip = await win.getByText(/\d+ apps · \d+ pages/).innerText()
    const [, apps, pages] = strip.match(/(\d+) apps · (\d+) pages/)!

    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('heading', { name: 'No backups yet' })).toBeVisible()

    await win.getByRole('button', { name: 'Back Up Now' }).click()
    await expect(win.getByText(`Backed up · ${apps} apps`)).toBeVisible()
    const rows = win.getByRole('listitem')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(`${apps} apps · ${pages} pages`)
    await expect(rows.first()).toContainText('Manual backup')

    // Device > Back Up Now does the same thing
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('backup')!.click())
    await expect(rows).toHaveCount(2)
    await app.close()

    // relaunch without a phone: the backups are still there to look at
    app = await launch({ JIGGLE_MOCK_DEVICE: 'none', JIGGLE_USER_DATA: userData })
    win = await app.firstWindow()
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('listitem')).toHaveCount(2)
    await expect(win.getByRole('button', { name: 'Back Up Now' })).toBeDisabled()
    await expect(win.getByText(/No iPhone connected/)).toBeVisible()
    await app.close()
  })
})

test.describe('Edit mode (drag and drop)', () => {
  const titles = (win: Page, scope = win.getByTestId('page')) =>
    scope.locator('[data-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('title')))
  const cell = (win: Page, title: string) =>
    win.getByTestId('page').locator(`[data-kind][title="${title}"]`)
  const centre = async (loc: ReturnType<typeof cell>) => {
    const b = (await loc.boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const dragTo = async (
    win: Page,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    await win.mouse.move(from.x, from.y)
    await win.mouse.down()
    await win.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
    await win.mouse.move(to.x, to.y, { steps: 10 })
    await win.mouse.up()
  }

  test('drags an icon from page 2 to page 1, undoes, redoes, and pushes it to the phone', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const original = await titles(win)
    await win.getByRole('button', { name: 'Edit' }).click()
    await expect(win.getByRole('button', { name: 'Done' })).toBeVisible()
    await win.getByRole('button', { name: 'Next page' }).click()
    const moving = (await titles(win))[0]!
    const from = await centre(cell(win, moving))

    // hold the icon at the left edge until the page turns, then drop it in slot 1
    const phone = (await win.getByTestId('page').boundingBox())!
    await win.mouse.move(from.x, from.y)
    await win.mouse.down()
    await win.mouse.move(from.x + 12, from.y + 12, { steps: 3 })
    await win.mouse.move(phone.x + 8, phone.y + 200, { steps: 10 })
    await expect(
      win.getByRole('group', { name: 'Pages' }).locator('[aria-current="page"]')
    ).toHaveAttribute('aria-label', 'Page 1', { timeout: 3000 })
    const first = await centre(win.getByTestId('page').locator('[data-kind]').first())
    await win.mouse.move(first.x, first.y, { steps: 10 })
    await win.mouse.up()
    // dnd-kit swallows clicks for a moment after a drop, so a person never clicks that fast
    await win.waitForTimeout(150)

    expect((await titles(win))[0]).toBe(moving)
    await expect(win.getByText('Editing · 1 change')).toBeVisible()
    await win.keyboard.press('Meta+z')
    expect(await titles(win)).toEqual(original)
    await win.keyboard.press('Shift+Meta+z')
    expect((await titles(win))[0]).toBe(moving)

    await win.getByRole('button', { name: 'Push to iPhone' }).click()
    const sheet = win.getByRole('dialog', { name: /Push 1 change to Sam/ })
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(sheet.getByText(/Done! Sam's iPhone matches your edits/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()
    // the phone has it now, and the draft is gone
    await expect(win.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(win.getByText(/change/)).toHaveCount(0)
    expect((await titles(win))[0]).toBe(moving)
    await app.close()
  })

  test('moves an icon with the keyboard: Space picks it up, arrows move it, Space drops it', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const [a, b] = await titles(win)
    await win.getByRole('button', { name: 'Edit' }).click()
    await win.getByTestId('page').getByRole('button', { name: a! }).focus()
    // (a beat between keys: the move is applied after each render)
    await win.keyboard.press('Space')
    await win.waitForTimeout(150)
    await win.keyboard.press('ArrowRight')
    await win.waitForTimeout(150)
    await win.keyboard.press('Space')
    await expect.poll(async () => (await titles(win)).slice(0, 2)).toEqual([b, a])
    await expect(win.getByText('Editing · 1 change')).toBeVisible()
    await app.close()
  })

  test('takes an app out of a folder, puts it back in, and discard drops the draft', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const original = await titles(win)
    await win.getByRole('button', { name: 'Edit' }).click()

    // open the folder and drag its first app out, onto slot 1
    const folder = win.getByTestId('page').locator('[data-kind="folder"]').first()
    const name = (await folder.getAttribute('title'))!
    await folder.click()
    const panel = win.getByRole('dialog', { name: `Folder ${name}` })
    await expect(panel).toBeVisible()
    const inside = panel.locator('[aria-roledescription="draggable"]').first()
    const app1 = (await inside.locator('[data-kind]').getAttribute('title'))!
    const src = (await inside.boundingBox())!
    const slot1 = await centre(win.getByTestId('page').locator('[data-kind]').first())
    await dragTo(win, { x: src.x + src.width / 2, y: src.y + src.height / 2 }, slot1)
    await expect.poll(async () => (await titles(win))[0]).toBe(app1)
    await expect(win.getByText('Editing · 1 change')).toBeVisible()

    // and back into the folder
    await dragTo(win, await centre(cell(win, app1)), await centre(folder))
    await expect.poll(async () => await titles(win)).toEqual(original)
    await expect(win.getByText('Editing · 2 changes')).toBeVisible()

    await win.getByRole('button', { name: 'Discard' }).click()
    await expect(win.getByText(/change/)).toHaveCount(0)
    await app.close()
  })

  test('refuses a drop into a full folder', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    await win.getByRole('button', { name: 'Edit' }).click()
    const folder = win.getByTestId('page').locator('[data-kind="folder"]').first()
    const mover = (await titles(win))[0]!
    await dragTo(win, await centre(cell(win, mover)), await centre(folder))
    await expect(win.getByText(/Can’t move it there/)).toBeVisible()
    expect((await titles(win))[0]).toBe(mover)
    await app.close()
  })

  test('read-only devices cannot be edited', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-ios16' })
    const win = await app.firstWindow()
    await win.getByRole('button', { name: /Continue/ }).click()
    await expect(win.getByRole('button', { name: 'Edit' })).toBeDisabled()
    await app.close()
  })
})

test.describe('Apply and restore', () => {
  const firstIcon = async (win: Page): Promise<string | null> =>
    win.getByTestId('page').locator('[data-kind="app"]').first().getAttribute('title')

  test('applies A–Z once even on a double click, backs up first, and restores', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const original = await firstIcon(win)

    await win.getByRole('link', { name: 'Organize' }).click()
    await win.getByRole('button', { name: 'Apply to iPhone' }).click()
    const sheet = win.getByRole('dialog', { name: /Apply A–Z to Sam/ })
    await expect(sheet).toContainText('Your current layout will be backed up first')
    await sheet.getByRole('button', { name: 'Apply', exact: true }).dblclick()
    await expect(sheet.getByText(/Done! Sam's iPhone is sorted A–Z/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()

    // the phone now shows the sorted layout
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect.poll(() => firstIcon(win)).not.toBe(original)

    // one backup, named for what it undoes
    await win.getByRole('link', { name: 'History' }).click()
    const rows = win.getByRole('listitem')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Before A–Z sort')

    // restore it
    await rows.first().getByRole('button', { name: 'Restore' }).click()
    const restore = win.getByRole('dialog', { name: /Restore “Before A–Z sort”/ })
    await restore.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(restore.getByText(/Restored/)).toBeVisible()
    await restore.getByRole('button', { name: 'Close' }).click()
    await expect(rows).toHaveCount(2) // the undo took a backup of its own
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect.poll(() => firstIcon(win)).toBe(original)
    await app.close()
  })

  test('read-only devices cannot restore', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'jiggle-e2e-ro-'))
    let app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_USER_DATA: userData })
    let win = await app.firstWindow()
    await win.getByRole('link', { name: 'History' }).click()
    await win.getByRole('button', { name: 'Back Up Now' }).click()
    await expect(win.getByRole('listitem')).toHaveCount(1)
    await expect(win.getByRole('button', { name: 'Restore' })).toBeEnabled()
    await app.close()

    // no phone at all: the backup is there, Restore is off
    app = await launch({ JIGGLE_MOCK_DEVICE: 'none', JIGGLE_USER_DATA: userData })
    win = await app.firstWindow()
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('button', { name: 'Restore' })).toBeDisabled()
    await app.close()
  })
})

test.describe('Hardening', () => {
  test('a page request to any host but the App Store lookup is blocked', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    const outcome = (url: string) =>
      win.evaluate(async (u) => {
        try {
          await fetch(u, { mode: 'no-cors' })
          return 'sent'
        } catch {
          return 'blocked'
        }
      }, url)
    expect(await outcome('https://example.com/')).toBe('blocked')
    expect(await outcome('http://itunes.apple.com.evil.test/')).toBe('blocked')
    await app.close()
  })

  test('the engine banner appears when the engine stops, and goes when it is back', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const send = (status: string) =>
      app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0]!.webContents.send('sidecar:status', s),
        status
      )
    await send('restarting')
    await expect(
      win.getByRole('status').filter({ hasText: 'The device engine stopped' })
    ).toBeVisible()
    await send('failed')
    await expect(win.getByRole('alert').filter({ hasText: 'won’t start' })).toBeVisible()
    await send('ready')
    await expect(win.getByText('The device engine')).toHaveCount(0)
    await app.close()
  })

  test('read-only mode shows its banner and turns Apply off', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-ios16' })
    const win = await app.firstWindow()
    await win.getByRole('button', { name: /Continue/ }).click()
    await expect(win.getByText('Apply is turned off for iOS 16.7')).toBeVisible()
    await win.getByRole('link', { name: 'Organize' }).click()
    await expect(win.getByRole('button', { name: 'Apply to iPhone' })).toBeDisabled()
    await app.close()
  })

  test('Settings (⌘,): appearance applies at once and the choices survive a relaunch', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'jiggle-e2e-settings-'))
    const open = async () => {
      const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_USER_DATA: userData })
      await app.firstWindow() // the main window, so Settings is the second
      const opened = app.waitForEvent('window')
      await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()!.getMenuItemById('settings')!.click()
      )
      const settings = await opened
      return { app, settings }
    }

    let { app, settings } = await open()
    await expect(settings.getByRole('tab', { name: 'General', selected: true })).toBeVisible()
    await settings.getByLabel('Appearance').selectOption('dark')
    await settings.getByLabel('Automatic backups to keep').selectOption('10')
    // (Playwright emulates the page as light, so ask Electron what the app is using)
    await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)).toBe(true)

    // a bad region is refused and put back
    const region = settings.getByLabel('App Store region')
    await region.fill('x1')
    await region.blur()
    await expect(region).not.toHaveValue('x1')

    await settings.getByRole('tab', { name: 'Privacy' }).click()
    // saved by the main process, so the box flips a moment after the click
    await settings.getByLabel('Look up categories online').click()
    await expect(settings.getByLabel('Look up categories online')).not.toBeChecked()
    await app.close()
    ;({ app, settings } = await open())
    await expect(settings.getByLabel('Appearance')).toHaveValue('dark')
    await expect(settings.getByLabel('Automatic backups to keep')).toHaveValue('10')
    await settings.getByRole('tab', { name: 'Privacy' }).click()
    await expect(settings.getByLabel('Look up categories online')).not.toBeChecked()
    await settings.getByRole('button', { name: 'Clear Cache' }).click()
    await expect(settings.getByText('Cleared.')).toBeVisible()
    await app.close()
  })
})

test.describe('Pinning', () => {
  test('pin from the right-click menu, badges on Home and Apps, kept after a relaunch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jiggle-e2e-'))
    const env = { JIGGLE_MOCK_DEVICE: 'iphone-messy', JIGGLE_USER_DATA: dir }
    let app = await launch(env)
    let win = await app.firstWindow()
    const page = win.getByTestId('page').first()
    await expect(page.locator('[data-kind="app"]').first()).toBeVisible()
    await expect(win.getByTestId('pin-badge')).toHaveCount(0)
    await page.locator('[data-kind="app"]').first().click({ button: 'right' })
    await win.getByRole('menuitem', { name: /^Pin / }).click()
    await expect(win.getByTestId('pin-badge')).toHaveCount(1)
    await win.getByRole('link', { name: 'Apps' }).click()
    await expect(win.getByTestId('pin-badge')).toHaveCount(1)

    // Pin page 1: fewer apps move than without it.
    await win.getByRole('link', { name: 'Organize' }).click()
    const summary = win.getByTestId('summary')
    await expect(summary).toHaveText(/^\d+ of \d+ apps will move/)
    const moves = async () => Number((await summary.innerText()).match(/^(\d+) of/)![1])
    const free = await moves()
    await win.getByRole('checkbox', { name: 'Pin page 1' }).click()
    await expect.poll(moves).toBeLessThan(free)
    await app.close()

    app = await launch(env)
    win = await app.firstWindow()
    await win.getByRole('link', { name: 'Organize' }).click()
    await expect(win.getByRole('checkbox', { name: 'Pin page 1' })).toBeChecked()
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect(win.getByTestId('pin-badge')).toHaveCount(1)
    await win
      .getByTestId('page')
      .first()
      .locator('[data-kind="app"]')
      .first()
      .click({ button: 'right' })
    await win.getByRole('menuitem', { name: /^Unpin / }).click()
    await expect(win.getByTestId('pin-badge')).toHaveCount(0)
    await app.close()
  })
})

test.describe('Auto-folders', () => {
  test('the toggle waits for Category, then the After frame shows folders you can open', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Organize' }).click()
    const toggle = win.getByRole('checkbox', { name: 'Create folders by category' })
    await expect(toggle).toBeDisabled()
    await win.getByRole('radio', { name: /Category/ }).click()
    await expect(toggle).toBeEnabled()
    await toggle.click()
    await expect(win.getByTestId('summary')).toContainText(/\d+ folders? created/)

    const after = win.getByRole('figure', { name: 'After' })
    await after
      .getByRole('button', { name: /^Open folder / })
      .first()
      .click()
    const dialog = after.getByRole('dialog', { name: /^Folder / })
    await expect(dialog.locator('[data-kind="app"]').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Close folder' }).click()
    await expect(dialog).toHaveCount(0)

    // back to A–Z: the option is off again
    await win.getByRole('radio', { name: /A–Z/ }).click()
    await expect(toggle).toBeDisabled()
    await expect(win.getByTestId('summary')).not.toContainText('created')
    await app.close()
  })
})

test.describe('Send to App Library', () => {
  test('picks three apps, lists them in the sheet, applies, and the Location changes', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Apps' }).click()
    const send = win.getByRole('button', { name: /^Send to App Library/ })
    await expect(send).toBeDisabled()

    // the dock's apps can't leave the home screen
    const dockRow = win.getByRole('row', { name: /Dock/ }).first()
    await expect(dockRow.getByRole('checkbox')).toBeDisabled()

    const onPages = win.getByRole('row', { name: /Page \d/ })
    const names: string[] = []
    for (const i of [0, 1, 2]) {
      const row = onPages.nth(i)
      names.push(((await row.getByRole('checkbox').getAttribute('aria-label')) ?? '').slice(7))
      // ⌘-click picks; the third uses its checkbox
      if (i < 2)
        await row
          .getByRole('cell')
          .nth(1)
          .click({ modifiers: ['Meta'] })
      else await row.getByRole('checkbox').click()
    }
    await expect(send).toHaveText('Send to App Library (3)')
    await send.click()
    const sheet = win.getByRole('dialog', { name: 'Send 3 apps to the App Library?' })
    for (const name of names) await expect(sheet).toContainText(name)
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(sheet.getByText(/Done! 3 apps are in the App Library/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()

    for (const name of names) {
      const row = win.getByRole('row').filter({ has: win.getByLabel(`Select ${name}`) })
      await expect(row).toContainText('App Library')
    }
    await expect(send).toBeDisabled()
    await app.close()
  })
})
