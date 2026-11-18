import type { Session } from 'electron'
import type { Logger } from './services/bridge/SidecarBridge'

// The only internet host the app talks to: Apple's public iTunes Lookup (categories and developers).
export const ALLOWED_HOSTS = ['itunes.apple.com']

const LOCAL_SCHEMES = ['file:', 'jiggle-icon:', 'devtools:', 'data:', 'blob:', 'about:']

// `devOrigin`: the Vite dev server's address while developing, so the page and hot reload still load.
export function isAllowedUrl(url: string, devOrigin?: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (LOCAL_SCHEMES.includes(parsed.protocol)) return true
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return false
  if (ALLOWED_HOSTS.includes(parsed.hostname)) return true
  return !!devOrigin && parsed.host === new URL(devOrigin).host
}

// Cancels every request the app's pages make to anywhere else. Category lookups run in the main process
// and are switched off by the "Look up categories online" setting.
export function enforceNetworkAllowlist(session: Session, log: Logger, devOrigin?: string): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedUrl(details.url, devOrigin)
    if (!allowed) log.warn(`blocked request to ${details.url} [network-blocked]`)
    callback({ cancel: !allowed })
  })
}
