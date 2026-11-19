// In dev the menu bar and Dock take their name and icon from the stock Electron.app, so "Electron" shows
// instead of "Jiggle". Rename it and swap its icon in node_modules (a packaged build has its own bundle).
// Runs before `pnpm dev`; a fresh `pnpm install` restores the stock app, and this fixes it again.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'

if (process.platform === 'darwin') {
  const contents = join(
    dirname(createRequire(import.meta.url).resolve('electron/package.json')),
    'dist/Electron.app/Contents'
  )
  if (existsSync(contents)) {
    const plist = join(contents, 'Info.plist')
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} Jiggle`, plist])
    }
    copyFileSync('build/icon.icns', join(contents, 'Resources/electron.icns'))
  }
}
