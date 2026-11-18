import { test, expect, _electron as electron } from '@playwright/test'

const launch = (env: Record<string, string> = {}) =>
  electron.launch({ args: ['.'], env: { ...process.env, JIGGLE_MOCK_DEVICE: 'none', ...env } })

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
    'device',
    'layout',
    'sidecar'
  ])
  await expect(win.evaluate('window.jiggle.layout.get(123)')).rejects.toThrow(
    /Invalid arguments for layout:get/
  )
  // the app keeps working after the rejection
  await expect(win.getByText("Sam's iPhone · iOS 26.1")).toBeVisible()
  await app.close()
})
