// What differs between the systems Jiggle runs on. Safe in both processes: no Node or DOM types needed.
export type Os = 'mac' | 'windows' | 'linux'

// Takes Node's process.platform ("darwin", "win32") or the page's navigator.platform ("MacIntel", "Win32").
export const osFrom = (id: string): Os =>
  /^(darwin|mac)/i.test(id) ? 'mac' : /^win/i.test(id) ? 'windows' : 'linux'

const node = (globalThis as { process?: { platform?: string } }).process
export const OS: Os = osFrom(node?.platform ?? globalThis.navigator.platform)

export interface OsText {
  computer: string // "this Mac"
  reveal: string // the button that shows a saved file
  logs: string // where electron-log writes
  alt: string // the key held to make a folder
}

const TEXT: Record<Os, OsText> = {
  mac: { computer: 'Mac', reveal: 'Show in Finder', logs: '~/Library/Logs/Jiggle', alt: '⌥' },
  windows: {
    computer: 'PC',
    reveal: 'Show in File Explorer',
    logs: '%APPDATA%\\Jiggle\\logs',
    alt: 'Alt'
  },
  linux: {
    computer: 'computer',
    reveal: 'Show in Folder',
    logs: '~/.config/Jiggle/logs',
    alt: 'Alt'
  }
}

export const osText = (os: Os = OS): OsText => TEXT[os]

// The shortcut key: ⌘ on a Mac, Ctrl elsewhere. A Mac's own Ctrl shortcuts stay untouched.
export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }, os: Os = OS): boolean =>
  os === 'mac' ? e.metaKey : e.ctrlKey
