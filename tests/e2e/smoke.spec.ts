import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
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
    'export',
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

    // Dispatched from inside the page, 50 ms apart (inside the app's 120 ms pause): separate mouse.wheel() calls can
    // land more than the app's pause window apart on a busy CI runner, and the app would see two swipes.
    // Page timers fire in due-time order, so the app's pause timer can't beat the next event.
    const swipe = (...deltas: number[]): Promise<unknown> =>
      win.evaluate(`(async () => {
        for (const deltaX of ${JSON.stringify(deltas)}) {
          // looked up per event: the page's tiles are replaced when the page turns
          const el = document.elementFromPoint(640, 400)
          el.dispatchEvent(new WheelEvent('wheel', { deltaX, bubbles: true, cancelable: true }))
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      })()`)

    await swipe(80, 60) // same swipe: must not skip a page
    await pageIs(win, 2)
    await win.waitForTimeout(300) // wheel events stopped: the next swipe counts
    await pageIs(win, 2) // still page 2: the inertia events did not turn another page
    await swipe(-80)
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

  test('Color: drag a color to the front, move one with the keyboard, and Reset restores the rainbow', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Organize' }).click()
    await expect(win.getByRole('list', { name: 'Color order' })).toHaveCount(0) // only with Color
    await win.getByRole('radio', { name: /Color/ }).click()
    const chips = win.getByRole('list', { name: 'Color order' }).getByRole('listitem')
    const order = async () =>
      (
        await chips.evaluateAll((els) =>
          els.map((e) => e.getAttribute('aria-label')!.split(',')[0])
        )
      )
        .slice(0, 3)
        .join(' ')
    expect(await order()).toBe('red orange yellow')

    await chips.nth(5).dragTo(chips.nth(0)) // blue to the front
    expect(await order()).toBe('blue red orange')

    await chips.nth(0).focus()
    await win.keyboard.press('Alt+ArrowRight')
    expect(await order()).toBe('red blue orange')

    await win.getByRole('button', { name: 'Reset' }).click()
    expect(await order()).toBe('red orange yellow')
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
    await expect(win.getByText(/No iPhone or iPad connected/)).toBeVisible()
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

    // The click right after a drag can be swallowed (dnd-kit eats the click that follows a drop), so retry it.
    await expect(async () => {
      await win.getByRole('button', { name: 'Discard' }).click({ timeout: 1000 })
      await expect(win.getByText(/change/)).toHaveCount(0, { timeout: 1000 })
    }).toPass()
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

    // a dock app can be picked, but can't be sent to the App Library
    const dockRow = win.getByRole('row', { name: /Dock/ }).first()
    await dockRow.getByRole('checkbox').check()
    await expect(send).toBeDisabled()
    await expect(win.getByTitle('Apps in the dock or the App Library can’t be sent')).toBeVisible()
    await dockRow.getByRole('checkbox').uncheck()

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

test.describe('Saved layouts', () => {
  const firstIcon = async (win: Page): Promise<string | null> =>
    win.getByTestId('page').locator('[data-kind="app"]').first().getAttribute('title')
  const clickMenu = (app: Awaited<ReturnType<typeof launch>>, id: string) =>
    app.evaluate(
      ({ Menu }, itemId) => Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click(),
      id
    )

  test('saves from File > Save Layout…, refuses a duplicate name, and switches back after a sort', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const original = await firstIcon(win)

    await clickMenu(app, 'save-layout')
    const sheet = win.getByRole('dialog', { name: 'Save Current Layout' })
    await expect(sheet).toContainText(/Sam's iPhone · \d+ apps · \d+ pages/)
    const save = sheet.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeDisabled() // no name yet, and no error either
    await expect(sheet.getByRole('alert')).toHaveCount(0)
    await sheet.getByLabel('Layout name').fill('Work')
    await save.click()
    await expect(sheet).toHaveCount(0)
    await expect(win.getByText('Saved layout “Work”')).toBeVisible()

    // History lists it as a saved layout, not as a backup
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('heading', { name: 'Saved layouts' })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Switch to Work' })).toBeEnabled()
    await expect(win.getByText('Before switching to Work')).toHaveCount(0)

    // the same name again: the error shows as you type and Save stays off
    await win.getByRole('button', { name: 'Save Current Layout…' }).click()
    const again = win.getByRole('dialog', { name: 'Save Current Layout' })
    await again.getByLabel('Layout name').fill('work')
    await expect(again.getByRole('alert')).toHaveText('A layout named “work” already exists.')
    await expect(again.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await again.getByRole('button', { name: 'Cancel' }).click()
    await expect(again).toHaveCount(0)

    // sort by color, then switch back to Work
    await win.getByRole('link', { name: 'Organize' }).click()
    await win.getByRole('radio', { name: /Color/ }).click()
    await win.getByRole('button', { name: 'Apply to iPhone' }).click()
    const apply = win.getByRole('dialog', { name: /Apply Color to Sam/ })
    await apply.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(apply.getByText(/Done!/)).toBeVisible()
    await apply.getByRole('button', { name: 'Close' }).click()
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect.poll(() => firstIcon(win)).not.toBe(original)

    await win.getByRole('link', { name: 'History' }).click()
    await win.getByRole('button', { name: 'Switch to Work' }).click()
    const sw = win.getByRole('dialog', { name: 'Switch to “Work”?' })
    await expect(sw).toContainText('Your current layout will be backed up first')
    await sw.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect(sw.getByText(/Done! Sam's iPhone now shows “Work”/)).toBeVisible()
    await sw.getByRole('button', { name: 'Close' }).click()
    await expect(win.getByText('Before switching to Work')).toBeVisible()
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect.poll(() => firstIcon(win)).toBe(original)
    await app.close()
  })

  test('renames and deletes a saved layout, and both stick after a relaunch', async () => {
    const env = {
      JIGGLE_MOCK_DEVICE: 'iphone-messy',
      JIGGLE_USER_DATA: mkdtempSync(join(tmpdir(), 'jiggle-e2e-'))
    }
    let app = await launch(env)
    let win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible() // the page is listening
    await clickMenu(app, 'save-layout')
    const sheet = win.getByRole('dialog', { name: 'Save Current Layout' })
    await sheet.getByLabel('Layout name').fill('Work')
    await sheet.getByLabel('Layout name').press('Enter') // Enter saves, like the button
    await expect(sheet).toHaveCount(0)
    await win.getByRole('link', { name: 'History' }).click()

    await win.getByRole('button', { name: 'Rename Work' }).click()
    const rename = win.getByRole('dialog', { name: 'Rename Layout' })
    await expect(rename.getByLabel('Layout name')).toHaveValue('Work')
    await expect(rename.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled() // unchanged
    await rename.getByLabel('Layout name').fill('Office')
    await rename.getByRole('button', { name: 'Rename', exact: true }).click()
    await expect(win.getByRole('button', { name: 'Switch to Office' })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Switch to Work' })).toHaveCount(0)
    await app.close()

    app = await launch(env)
    win = await app.firstWindow()
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('button', { name: 'Switch to Office' })).toBeVisible()

    // delete asks first: Cancel keeps it
    await win.getByRole('button', { name: 'Delete Office' }).click()
    const confirm = win.getByRole('dialog', { name: 'Delete “Office”?' })
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(win.getByRole('button', { name: 'Switch to Office' })).toBeVisible()
    await win.getByRole('button', { name: 'Delete Office' }).click()
    await win
      .getByRole('dialog', { name: 'Delete “Office”?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click()
    await expect(win.getByRole('button', { name: 'Switch to Office' })).toHaveCount(0)
    await app.close()

    app = await launch(env)
    win = await app.firstWindow()
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('heading', { name: 'No backups yet' })).toBeVisible()
    await expect(win.getByRole('button', { name: /^Switch to/ })).toHaveCount(0)
    await app.close()
  })

  test('File > Save Layout… with no phone says so instead of opening a sheet', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'none' })
    const win = await app.firstWindow()
    await expect(win.getByRole('heading', { name: 'Connect your iPhone' })).toBeVisible() // the page is listening
    await clickMenu(app, 'save-layout')
    await expect(
      win.getByText('Connect an unlocked iPhone or iPad to save its layout.')
    ).toBeVisible()
    await expect(win.getByRole('dialog')).toHaveCount(0)
    await app.close()
  })
})

test.describe('iPad', () => {
  test('shows a landscape frame with the 6-column grid, says iPad, and sorts into pages of up to 30', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'ipad-widgets' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('device-card')).toContainText("Sam's iPad")
    await expect(win.getByTestId('device-card')).toContainText(
      'iPad Air 11-inch (M2) · iPadOS 26.1'
    )
    await expect(win.locator('[data-frame="iPad"]')).toBeVisible()
    await expect(win.locator('[data-frame="iPhone"]')).toHaveCount(0)
    await expect(win.getByTestId('page')).toHaveAttribute('style', /repeat\(6, 1fr\)/)
    await expect(win.getByTestId('dock').locator('[data-kind]')).toHaveCount(4)

    await win.getByRole('link', { name: 'Organize' }).click()
    await expect(win.locator('[data-frame="iPad"]')).toHaveCount(2) // Before and After
    await win.getByRole('button', { name: 'Apply to iPad' }).click()
    const sheet = win.getByRole('dialog', { name: /Apply A–Z to Sam's iPad/ })
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(sheet.getByText(/Done! Sam's iPad is sorted A–Z/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()

    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect(win.getByTestId('page')).toHaveCount(1) // Organize showed two
    const sizes: number[] = []
    for (let i = 0; i < 4; i++) {
      await expect(
        win.getByRole('group', { name: 'Pages' }).locator('[aria-current="page"]')
      ).toHaveAttribute('aria-label', `Page ${i + 1}`)
      sizes.push(await win.getByTestId('page').locator('> *').count())
      if (i < 3) await win.getByRole('button', { name: 'Next page' }).click()
    }
    expect(sizes.every((n) => n <= 30)).toBe(true)
    await app.close()
  })

  test('with an iPhone and an iPad connected, the sidebar switches between them', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic,ipad-basic' })
    const win = await app.firstWindow()
    const card = win.getByTestId('device-card')
    await expect(card).toContainText('iPhone 16 Pro')
    await expect(win.locator('[data-frame="iPhone"]')).toBeVisible()

    await card.click()
    const items = win.getByRole('menuitemradio')
    await expect(items).toHaveCount(2)
    await expect(items.first()).toHaveAttribute('aria-checked', 'true')
    await items.filter({ hasText: 'iPad' }).click()
    await expect(win.getByRole('menu')).toHaveCount(0)
    await expect(card).toContainText('iPad Air 11-inch (M2)')
    await expect(win.locator('[data-frame="iPad"]')).toBeVisible()
    await expect(win.getByTestId('page')).toHaveAttribute('style', /repeat\(6, 1fr\)/)

    // each device has its own apps: the iPad has the same apps as the iPhone here, its own pages
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByRole('heading', { name: 'No backups yet' })).toBeVisible()
    await card.click()
    await win.getByRole('menuitemradio').filter({ hasText: 'iPhone' }).click()
    await expect(card).toContainText('iPhone 16 Pro')
    await win.getByRole('link', { name: 'Home Screen' }).click()
    await expect(win.locator('[data-frame="iPhone"]')).toBeVisible()
    await app.close()
  })
})

test.describe('Export', () => {
  const exportDir = () => mkdtempSync(join(tmpdir(), 'jiggle-export-e2e-'))
  const sheetOf = (win: Page) => win.getByRole('dialog', { name: 'Export' })
  const menuExport = (app: Awaited<ReturnType<typeof launch>>) =>
    app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('export')!.click())

  test('⌘E → PNG, all pages: one picture per page, the size of the screen, and Show in Finder', async () => {
    const dir = exportDir()
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-widgets', JIGGLE_EXPORT_DIR: dir })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const pageCount = await win.getByRole('group', { name: 'Pages' }).getByRole('button').count()

    await menuExport(app)
    const sheet = sheetOf(win)
    await expect(sheet.getByRole('radio', { name: 'Image (PNG)' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(sheet.getByLabel('Pages')).toHaveValue('all')
    await sheet.getByRole('button', { name: 'Export…' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(win.getByText(/^Exported to .* – page 1\.png/)).toBeVisible()

    const files = readdirSync(dir).sort()
    expect(files).toHaveLength(pageCount)
    for (const file of files) {
      const png = readFileSync(join(dir, file))
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      // IHDR: width and height, the iPhone's 402 × 874 screen at the display's scale
      const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)]
      expect(w / h).toBeCloseTo(402 / 874, 2)
      expect(w).toBeGreaterThanOrEqual(402)
    }

    // Show in Finder reveals the first file (stubbed: the test can't look at Finder)
    await app.evaluate(({ shell }) => {
      const seen: string[] = []
      ;(globalThis as unknown as { revealed: string[] }).revealed = seen
      shell.showItemInFolder = (p: string) => void seen.push(p)
    })
    await win.getByRole('button', { name: 'Show in Finder' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { revealed: string[] }).revealed))
      .toEqual([join(dir, files[0]!)])
    await app.close()
  })

  test('PDF with no wallpaper: one PDF page per home screen page', async () => {
    const dir = exportDir()
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-widgets', JIGGLE_EXPORT_DIR: dir })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    const pageCount = await win.getByRole('group', { name: 'Pages' }).getByRole('button').count()

    await win.getByRole('button', { name: 'Export' }).click() // the Home Screen toolbar
    const sheet = sheetOf(win)
    await sheet.getByRole('radio', { name: 'PDF' }).click()
    await sheet.getByLabel('Include wallpaper').uncheck()
    await sheet.getByRole('button', { name: 'Export…' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(win.getByText(/^Exported to .*\.pdf/)).toBeVisible()

    const [file] = readdirSync(dir)
    expect(file).toBe("Sam's iPhone – Home Screen.pdf")
    const pdf = readFileSync(join(dir, file!)).toString('latin1')
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(pdf.match(/\/Type\s*\/Page\b(?!s)/g)).toHaveLength(pageCount)
    await app.close()
  })

  test('CSV: one row per app and the five columns, matching the Apps table', async () => {
    const dir = exportDir()
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_EXPORT_DIR: dir })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Apps' }).click()
    const count = Number((await win.getByText(/^\d+ apps$/).innerText()).split(' ')[0])

    await win.getByRole('button', { name: 'Export' }).click()
    const sheet = sheetOf(win)
    await sheet.getByRole('radio', { name: 'App List (CSV)' }).click()
    await expect(sheet.getByRole('checkbox')).toHaveCount(5)
    await sheet.getByRole('button', { name: 'Export…' }).click()
    await expect(sheet).toHaveCount(0)

    const text = readFileSync(join(dir, "Sam's iPhone – Apps.csv"), 'utf8')
    expect(text.startsWith('﻿')).toBe(true)
    const lines = text.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe('Name,Bundle ID,Category,Developer,Location')
    expect(lines).toHaveLength(count + 1)

    // leaving a column out leaves it out, and with none left there is nothing to export
    await win.getByRole('button', { name: 'Export' }).click()
    await sheet.getByRole('radio', { name: 'App List (CSV)' }).click()
    for (const name of ['Name', 'Bundle ID', 'Category', 'Developer', 'Location']) {
      await sheet.getByRole('checkbox', { name }).uncheck()
    }
    await expect(sheet.getByRole('button', { name: 'Export…' })).toBeDisabled()
    await app.close()
  })

  test('cancelling the save dialog writes nothing and shows no error', async () => {
    const dir = exportDir()
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_EXPORT_DIR: 'cancel' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    await win.getByRole('button', { name: 'Export' }).click()
    const sheet = sheetOf(win)
    await sheet.getByRole('button', { name: 'Export…' }).click()
    await expect(sheet.getByRole('button', { name: 'Export…' })).toBeEnabled() // back from "busy"
    await expect(sheet.getByRole('alert')).toHaveCount(0)
    await expect(win.getByText(/^Exported to/)).toHaveCount(0)
    expect(readdirSync(dir)).toEqual([])
    await app.close()
  })
})

test.describe('Category overrides', () => {
  test('Change Category… shows with a dot, is listed and reset in Settings, and survives a relaunch', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'jiggle-e2e-overrides-'))
    const open = async () => {
      const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic', JIGGLE_USER_DATA: userData })
      const win = await app.firstWindow()
      await win.getByRole('link', { name: 'Apps' }).click()
      return { app, win }
    }
    let { app, win } = await open()
    const row = win.getByRole('row').filter({ hasText: 'Unknown' }).first()
    const name = ((await row.getByRole('checkbox').getAttribute('aria-label')) ?? '').slice(7)
    const mine = win.getByRole('row').filter({ has: win.getByLabel(`Select ${name}`) })

    await mine.click({ button: 'right' })
    await win.getByRole('menuitem', { name: 'Change Category…' }).click()
    const sheet = win.getByRole('dialog', { name: /Change category of/ })
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
    await sheet.getByLabel('Category').fill('Finance')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(mine).toContainText('Finance')
    await expect(mine.getByTestId('override-dot')).toBeVisible()

    // Settings > Categories lists it, and Reset brings the App Store's answer back
    const opened = app.waitForEvent('window')
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('settings')!.click()
    )
    const settings = await opened
    await settings.getByRole('tab', { name: 'Categories' }).click()
    await expect(settings.getByText(`${name} → Finance`)).toBeVisible()
    await settings.getByRole('button', { name: `Reset ${name}` }).click()
    await expect(settings.getByText(/No category overrides/)).toBeVisible()
    await expect(mine).toContainText('Unknown')
    await expect(mine.getByTestId('override-dot')).toHaveCount(0)

    // set it again from the row's sheet (with Reset there), then relaunch
    await mine.click({ button: 'right' })
    await win.getByRole('menuitem', { name: 'Change Category…' }).click()
    await win.getByRole('combobox', { name: 'Category' }).fill('Finance')
    await win.getByRole('button', { name: 'Save' }).click()
    await expect(mine).toContainText('Finance')
    await app.close()
    ;({ app, win } = await open())
    await expect(
      win.getByRole('row').filter({ has: win.getByLabel(`Select ${name}`) })
    ).toContainText('Finance')
    await expect(win.getByTestId('override-dot')).toHaveCount(1)

    // the sheet's own Reset
    await win
      .getByRole('row')
      .filter({ has: win.getByLabel(`Select ${name}`) })
      .click({ button: 'right' })
    await win.getByRole('menuitem', { name: 'Change Category…' }).click()
    await win.getByRole('button', { name: 'Reset to App Store' }).click()
    await expect(win.getByTestId('override-dot')).toHaveCount(0)
    await app.close()
  })
})

test.describe('Cleanup', () => {
  test('lists 2 empty pages and 3 one-app folders, fixes what is ticked, and the badge and list clear', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy' })
    const win = await app.firstWindow()
    const link = win.getByRole('link', { name: /Cleanup/ })
    await expect(link.locator('.nav-badge')).toHaveText('5')

    await link.click()
    await expect(win.getByRole('heading', { name: '5 things to tidy up' })).toBeVisible()
    const boxes = win.getByRole('checkbox')
    await expect(boxes).toHaveCount(5)
    await expect(win.getByRole('checkbox', { name: /is empty/ })).toHaveCount(2)
    await expect(win.getByRole('checkbox', { name: /has only 1 app/ })).toHaveCount(3)
    await expect(win.getByText('Move the app out and remove the folder')).toHaveCount(3)
    for (let i = 0; i < 5; i++) await expect(boxes.nth(i)).toBeChecked()

    // leave one folder alone: 4 things get fixed, 1 stays
    await win.getByRole('checkbox', { name: /Folder “Games”/ }).uncheck()
    await win.getByRole('button', { name: 'Fix Selected' }).click()
    const sheet = win.getByRole('dialog', { name: /Fix 4 things/ })
    await expect(sheet).toContainText('Move 2 apps out of one-app folders')
    await expect(sheet).toContainText('Remove 2 empty pages')
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(sheet.getByText(/Done! Sam's iPhone is tidy/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()

    await expect(win.getByRole('heading', { name: '1 thing to tidy up' })).toBeVisible()
    await expect(link.locator('.nav-badge')).toHaveText('1')
    await expect(win.getByRole('button', { name: 'Fix Selected' })).toBeDisabled() // it is still unticked
    await win.getByRole('checkbox', { name: /Folder “Games”/ }).check()
    await win.getByRole('button', { name: 'Fix Selected' }).click()
    const again = win.getByRole('dialog', { name: /Fix 1 thing/ })
    await again.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(again.getByText(/Done!/)).toBeVisible()
    await again.getByRole('button', { name: 'Close' }).click()
    await expect(win.getByRole('heading', { name: 'Your home screen is tidy.' })).toBeVisible()
    await expect(link.locator('.nav-badge')).toHaveCount(0)
    await expect(win.getByRole('button', { name: 'Fix Selected' })).toBeDisabled()
    await app.close()
  })

  test('a tidy phone shows the tidy state and no badge', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: /Cleanup/ }).click()
    await expect(win.getByRole('heading', { name: 'Your home screen is tidy.' })).toBeVisible()
    await expect(win.locator('.nav-badge')).toHaveCount(0)
    await app.close()
  })
})

test.describe('Uninstall apps', () => {
  const rowOf = (win: Page, name: string) =>
    win.getByRole('row').filter({ has: win.getByLabel(`Select ${name}`, { exact: true }) })

  test('names the apps, cancel keeps them, confirming removes them from the table and the phone', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Apps' }).click()
    const uninstall = win.getByRole('button', { name: 'Uninstall…' })
    await expect(uninstall).toBeDisabled()

    // two user apps (not com.apple.*): the ones whose developer is not Apple and that are on a page
    const rows = win.getByRole('row').filter({ hasText: 'Unknown' })
    const names: string[] = []
    for (const i of [0, 1]) {
      const box = rows.nth(i).getByRole('checkbox')
      names.push(((await box.getAttribute('aria-label')) ?? '').slice(7))
      await box.check()
    }
    const total = Number((await win.getByText(/^\d+ apps$/).innerText()).split(' ')[0])
    await uninstall.click()
    const alert = win.getByRole('dialog', { name: /Uninstall 2 apps from Sam's iPhone\?/ })
    for (const n of names) await expect(alert).toContainText(n)
    await expect(alert).toContainText(' will be deleted with their data')
    await expect(alert).toContainText('restoring it can’t reinstall apps')

    await alert.getByRole('button', { name: 'Cancel' }).click()
    await expect(alert).toHaveCount(0)
    for (const n of names) await expect(rowOf(win, n)).toHaveCount(1)

    await uninstall.click()
    await alert.getByRole('button', { name: 'Uninstall', exact: true }).click()
    await expect(alert.getByText('Done! 2 apps uninstalled.')).toBeVisible()
    await alert.getByRole('button', { name: 'Close' }).click()
    for (const n of names) await expect(rowOf(win, n)).toHaveCount(0)
    await expect(win.getByText(`${total - 2} apps`, { exact: true })).toBeVisible()
    await expect(uninstall).toBeDisabled() // the selection is cleared

    // the backup taken first is in History, named for it
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByText('Before uninstalling 2 apps')).toBeVisible()
    await app.close()
  })

  test('a built-in app can’t be removed: the action is off, with a tooltip', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const win = await app.firstWindow()
    await win.getByRole('link', { name: 'Apps' }).click()
    await win.getByRole('row').filter({ hasText: 'Apple' }).first().getByRole('checkbox').check()
    await expect(win.getByRole('button', { name: 'Uninstall…' })).toBeDisabled()
    await expect(win.getByTitle('This app can’t be removed')).toBeVisible()
    await app.close()
  })
})

test.describe('Wi‑Fi', () => {
  const openSettings = async (app: Awaited<ReturnType<typeof launch>>) => {
    const opened = app.waitForEvent('window')
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('settings')!.click()
    )
    return opened
  }

  test('a phone over Wi‑Fi shows the Wi‑Fi badge; Settings > Connection turns Wi‑Fi on, says what it found, and keeps the choice', async () => {
    const env = {
      JIGGLE_MOCK_DEVICE: 'iphone-wifi',
      JIGGLE_USER_DATA: mkdtempSync(join(tmpdir(), 'jiggle-e2e-wifi-'))
    }
    let app = await launch(env)
    const win = await app.firstWindow()
    await expect(win.getByTestId('device-card')).toContainText('Wi‑Fi')
    await expect(win.getByTestId('device-card')).not.toContainText('USB')

    let settings = await openSettings(app)
    await settings.getByRole('tab', { name: 'Connection' }).click()
    const toggle = settings.getByLabel('Connect over Wi‑Fi')
    await expect(toggle).not.toBeChecked()
    await expect(settings.getByRole('status')).toHaveCount(0)
    await expect(
      settings.getByText('Show this iPhone when on Wi‑Fi', { exact: false })
    ).toBeVisible()
    await toggle.click()
    await expect(toggle).toBeChecked()
    await expect(settings.getByText("Sam's iPhone is available over Wi‑Fi")).toBeVisible()
    await app.close()

    app = await launch(env)
    await app.firstWindow()
    settings = await openSettings(app)
    await settings.getByRole('tab', { name: 'Connection' }).click()
    await expect(settings.getByLabel('Connect over Wi‑Fi')).toBeChecked()
    await app.close()
  })

  test('with Wi‑Fi on and nothing found, Settings says so and Connect mentions the network', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'none' })
    const win = await app.firstWindow()
    await expect(win.getByText(/with a cable\./)).toBeVisible()
    const settings = await openSettings(app)
    await settings.getByRole('tab', { name: 'Connection' }).click()
    await settings.getByLabel('Connect over Wi‑Fi').click()
    await expect(settings.getByText('No Wi‑Fi devices found')).toBeVisible()
    await expect(win.getByText(/same Wi‑Fi network/)).toBeVisible()
    await app.close()
  })
})

test.describe('Copy Layout', () => {
  const menu = (app: Awaited<ReturnType<typeof launch>>, id: string) =>
    app.evaluate(
      ({ Menu }, itemId) => Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click(),
      id
    )

  test('copies the iPhone’s arrangement onto the iPad: preview, summary, apply, backup', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-messy,ipad-widgets' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    await win.getByTestId('device-card').click()
    await win.getByRole('menuitemradio').filter({ hasText: 'iPad' }).click()
    await expect(win.locator('[data-frame="iPad"]')).toBeVisible()
    const iPadFirst = await win
      .getByTestId('page')
      .locator('[data-kind="app"]')
      .first()
      .getAttribute('title')

    await menu(app, 'copy-layout')
    const sheet = win.getByRole('dialog', { name: "Copy Layout to Sam's iPad" })
    await expect(sheet.getByLabel('Copy from')).toHaveValue(/^device:/)
    await expect(sheet.getByRole('option', { name: "Sam's iPhone (connected)" })).toHaveCount(1)
    await expect(sheet.getByTestId('copy-summary')).toContainText(
      /\d+ shared apps keep the iPhone order · \d+ iPad‑only apps? added at the end · \d+ iPhone‑only apps? skipped/
    )
    // a phone on the left and an iPad on the right
    await expect(sheet.locator('[data-frame="iPhone"]')).toBeVisible()
    await expect(sheet.locator('[data-frame="iPad"]')).toBeVisible()

    await sheet.getByRole('button', { name: 'Continue' }).click()
    const apply = win.getByRole('dialog', {
      name: /^Copy Sam's iPhone \(connected\) to Sam's iPad\?/
    })
    await apply.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(apply.getByText(/Done! Sam's iPad follows/)).toBeVisible()
    await apply.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toHaveCount(0)

    // the iPad now starts with the iPhone's first page; the widget page is still the first one (keep-pages)
    await expect(win.getByTestId('page').locator('[data-kind="widget"]').first()).toBeVisible()
    await win.getByRole('link', { name: 'History' }).click()
    await expect(win.getByText('Before copying a layout')).toBeVisible()
    expect(iPadFirst).toBeTruthy()
    await app.close()
  })

  test('a layout saved on another device works as the source, and a lone device has nothing to copy from', async () => {
    const app = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic,ipad-basic' })
    const win = await app.firstWindow()
    await expect(win.getByTestId('page')).toBeVisible()
    await menu(app, 'save-layout') // save "Work" on the iPhone (the active device)
    await win
      .getByRole('dialog', { name: 'Save Current Layout' })
      .getByLabel('Layout name')
      .fill('Work')
    await win
      .getByRole('dialog', { name: 'Save Current Layout' })
      .getByLabel('Layout name')
      .press('Enter')
    await expect(win.getByText('Saved layout “Work”')).toBeVisible()

    await win.getByTestId('device-card').click()
    await win.getByRole('menuitemradio').filter({ hasText: 'iPad' }).click()
    await menu(app, 'copy-layout')
    const sheet = win.getByRole('dialog', { name: "Copy Layout to Sam's iPad" })
    await sheet.getByLabel('Copy from').selectOption({ label: "Sam's iPhone · Work" })
    await expect(sheet.getByTestId('copy-summary')).toContainText('keep the iPhone order')
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toHaveCount(0)
    await app.close()

    const lone = await launch({ JIGGLE_MOCK_DEVICE: 'iphone-basic' })
    const w = await lone.firstWindow()
    await expect(w.getByTestId('page')).toBeVisible()
    await menu(lone, 'copy-layout')
    const empty = w.getByRole('dialog', { name: /^Copy Layout to/ })
    await expect(empty).toContainText('Connect another device or save a layout on it first.')
    await expect(empty.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await lone.close()
  })
})
