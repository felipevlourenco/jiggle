import { join } from 'node:path'

// Everything Jiggle stores lives under Electron's userData folder (`root`).
export const deviceDir = (root: string, udid: string): string => join(root, 'devices', udid)
export const iconsDir = (root: string, udid: string): string => join(deviceDir(root, udid), 'icons')
export const snapshotsDir = (root: string, udid: string): string =>
  join(deviceDir(root, udid), 'snapshots')

const UDID = /^[0-9A-Fa-f-]+$/ // UDIDs are hex
export const isSafeUdid = (udid: string): boolean => UDID.test(udid)
const FILE = /^[A-Za-z0-9._-]+\.png$/
export const isSafeBundleId = (id: string): boolean => /^[A-Za-z0-9._-]+$/.test(id)

// jiggle-icon://icons/<udid>/<file>.png  ->  the cached file's path, or null for anything else.
export function resolveAssetUrl(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.host !== 'icons') return null
  const [udid, file, ...rest] = parsed.pathname.split('/').filter(Boolean)
  if (!udid || !file || rest.length || !UDID.test(udid) || !FILE.test(decodeURIComponent(file))) {
    return null
  }
  return join(iconsDir(root, udid), decodeURIComponent(file))
}
