import { describe, expect, it } from 'vitest'
import { isAllowedUrl } from '../network'

describe('isAllowedUrl', () => {
  it('allows the app itself and Apple’s lookup service', () => {
    for (const url of [
      'file:///Applications/Jiggle.app/index.html',
      'jiggle-icon://icons/AB/a.png',
      'devtools://devtools/bundled/x.js',
      'data:image/png;base64,AAAA',
      'https://itunes.apple.com/lookup?bundleId=a.b',
      'https://github.com/felipevlourenco/jiggle/releases/download/v0.1.1/latest-mac.yml',
      'https://objects.githubusercontent.com/x'
    ]) {
      expect(isAllowedUrl(url), url).toBe(true)
    }
  })

  it('blocks every other host, and look-alikes', () => {
    for (const url of [
      'https://example.com/',
      'http://itunes.apple.com.evil.test/',
      'https://evil.test/itunes.apple.com',
      'https://apple.com/',
      'wss://example.com/socket',
      'ftp://itunes.apple.com/',
      'not a url'
    ]) {
      expect(isAllowedUrl(url), url).toBe(false)
    }
  })

  it('allows the dev server only while developing', () => {
    expect(isAllowedUrl('http://localhost:5173/src/main.tsx')).toBe(false)
    expect(isAllowedUrl('http://localhost:5173/src/main.tsx', 'http://localhost:5173')).toBe(true)
    expect(isAllowedUrl('ws://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isAllowedUrl('http://localhost:9999/', 'http://localhost:5173')).toBe(false)
  })
})
