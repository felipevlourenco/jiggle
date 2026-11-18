import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, _electron as electron, type Page } from '@playwright/test'

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
  await expect(win.getByText("Sam's iPhone · iOS 26.1")).toBeVisible()
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
  await expect(win.getByText("Sam's iPhone · iOS 26.1")).toBeVisible()
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
    'settings',
    'sidecar',
    'snapshots',
    'toast'
  ])
  await expect(win.evaluate('window.jiggle.layout.get(123)')).rejects.toThrow(
    /Invalid arguments for layout:get/
  )
  // the app keeps working after the rejection
  await expect(win.getByText("Sam's iPhone · iOS 26.1")).toBeVisible()
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
