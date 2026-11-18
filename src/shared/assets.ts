// URLs for cached images served by the main process's jiggle-icon protocol.
export const ASSET_SCHEME = 'jiggle-icon'

export const iconUrl = (udid: string, bundleId: string): string =>
  `${ASSET_SCHEME}://icons/${udid}/${encodeURIComponent(bundleId)}.png`
