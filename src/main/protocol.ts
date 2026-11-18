import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { ASSET_SCHEME } from '@shared/assets'
import { resolveAssetUrl } from './services/storage/paths'

// Must run before the app is ready.
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

// Serves cached icons, so the renderer never touches the filesystem.
export function handleAssetProtocol(root: string): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const file = resolveAssetUrl(root, request.url)
    if (!file) return new Response('Not found', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
