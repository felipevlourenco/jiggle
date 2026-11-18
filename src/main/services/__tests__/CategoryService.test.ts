import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CategoryService } from '../CategoryService'

const silent = { debug() {}, info() {}, warn() {}, error() {} }
const app = (bundleId: string) => ({ bundleId, name: bundleId, removable: true })

const store: Record<string, { primaryGenreName: string; artistName: string }> = {
  'com.spotify.client': { primaryGenreName: 'Music', artistName: 'Spotify' }
}
const respond = (url: string) => {
  const hit = store[new URL(url).searchParams.get('bundleId') ?? '']
  return Response.json({ resultCount: hit ? 1 : 0, results: hit ? [hit] : [] })
}

function setup(
  fetchImpl: (url: string) => Promise<Response> = async (u) => respond(u),
  root?: string,
  extra: { enabled?: () => boolean; storefront?: () => string } = {}
) {
  const dir = root ?? mkdtempSync(join(tmpdir(), 'jiggle-cat-'))
  const fetchMock = vi.fn(fetchImpl)
  const onChange = vi.fn()
  const service = new CategoryService({
    root: dir,
    storefront: () => 'nl',
    log: silent,
    onChange,
    ...extra,
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {}
  })
  return { dir, fetchMock, onChange, service }
}
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('CategoryService', () => {
  it('answers Apple apps without a lookup, and Unknown until the App Store replies', async () => {
    const { service, fetchMock } = setup()
    const first = service.resolve([app('com.apple.mail'), app('com.spotify.client')])
    expect(first.apps[0]).toMatchObject({
      category: 'Apple',
      developer: 'Apple',
      categorySource: 'apple'
    })
    expect(first.apps[1]).toMatchObject({ category: 'Unknown', developer: null })
    expect(first.lookup).toBe('running')
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1) // only Spotify
    expect(fetchMock.mock.calls[0]![0]).toContain('country=nl')
    const second = service.resolve([app('com.spotify.client')])
    expect(second.apps[0]).toMatchObject({
      category: 'Music',
      developer: 'Spotify',
      categorySource: 'appstore'
    })
    expect(second.lookup).toBe('idle')
  })

  it('makes zero requests on the next launch for what is cached, including "not on the App Store"', async () => {
    const a = setup()
    a.service.resolve([app('com.spotify.client'), app('ghost.app')])
    await settle()
    const b = setup(async (u) => respond(u), a.dir)
    const got = b.service.resolve([app('com.spotify.client'), app('ghost.app')])
    await settle()
    expect(b.fetchMock).not.toHaveBeenCalled()
    expect(got.apps.map((x) => x.category)).toEqual(['Music', 'Unknown'])
  })

  it('makes no request at all when lookups are switched off', async () => {
    const { service, fetchMock } = setup(undefined, undefined, { enabled: () => false })
    const result = service.resolve([app('com.spotify.client')])
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.lookup).toBe('idle')
    expect(result.apps[0]).toMatchObject({ category: 'Unknown' })
  })

  it('stops mid-way when lookups are switched off, and follows a changed region', async () => {
    let on = true
    let region = 'nl'
    const { service, fetchMock } = setup(
      async (u) => {
        on = false // switched off after the first request
        return respond(u)
      },
      undefined,
      { enabled: () => on, storefront: () => region }
    )
    service.resolve([app('a.a'), app('b.b'), app('c.c')])
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    on = true
    region = 'us'
    service.resolve([app('a.a')])
    await settle()
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('country=us') // a "nl" answer isn't reused for "us"
  })

  it('forgets everything on clear', async () => {
    const { service, dir } = setup()
    service.resolve([app('com.spotify.client')])
    await settle()
    await service.clear()
    expect(service.resolve([app('com.spotify.client')]).apps[0]!.category).toBe('Unknown')
    expect(readFileSync(join(dir, 'category-cache.json'), 'utf8')).toBe('{}')
  })

  it('looks the apps up one at a time', async () => {
    let active = 0
    let peak = 0
    const { service } = setup(async (u) => {
      peak = Math.max(peak, ++active)
      await new Promise((r) => setTimeout(r, 1))
      active--
      return respond(u)
    })
    service.resolve([app('a.a'), app('b.b'), app('c.c')])
    await settle()
    expect(peak).toBe(1)
  })

  it('retries with backoff, then reports offline without caching the failure', async () => {
    let calls = 0
    const { service, dir, onChange } = setup(async () => {
      calls++
      throw new TypeError('fetch failed')
    })
    service.resolve([app('a.a'), app('b.b')])
    await settle()
    expect(calls).toBe(3) // 3 attempts for a.a, then b.b is skipped: no network
    expect(service.resolve([app('a.a')]).lookup).toBe('offline')
    expect(calls).toBe(3) // not retried this session
    expect(onChange).toHaveBeenCalled()
    expect(JSON.parse(readFileSync(join(dir, 'category-cache.json'), 'utf8'))).toEqual({})
  })

  it('does not trust a cache from another storefront', async () => {
    const a = setup()
    a.service.resolve([app('com.spotify.client')])
    await settle()
    const b = new CategoryService({
      root: a.dir,
      storefront: () => 'us',
      log: silent,
      onChange() {},
      fetch: vi.fn(async (u: string) => respond(u)) as unknown as typeof fetch,
      sleep: async () => {}
    })
    expect(b.resolve([app('com.spotify.client')]).apps[0]!.category).toBe('Unknown')
  })
})
