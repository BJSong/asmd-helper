import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../shared/model'
import { authorizeCloud, loadCloud, saveCloud } from '../server/utils/cloud'

const event = {} as Parameters<typeof authorizeCloud>[0]
const config = {
  cloudEnabled: true,
  cloudAccessToken: 'a'.repeat(32),
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceKey: 'server-only-test-key',
}

function globals(fetcher = vi.fn()) {
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('getHeader', (_event: unknown, name: string) => name === 'authorization' ? `Bearer ${config.cloudAccessToken}` : undefined)
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
  vi.stubGlobal('$fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('cloud API to database contract', () => {
  it('keeps the service key server-side and sends the expected revisioned snapshot', async () => {
    const fetcher = globals(vi.fn().mockResolvedValue(1))
    authorizeCloud(event)
    const result = await saveCloud(event, emptyState(), 0)
    expect(result.revision).toBe(1)
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/save_learning_state',
      expect.objectContaining({
        method: 'POST',
        headers: { apikey: config.supabaseServiceKey, Authorization: `Bearer ${config.supabaseServiceKey}` },
        body: { next_state: result, expected_revision: 0 },
      }),
    )
  })

  it('loads a database snapshot through the shared model migration', async () => {
    const oldState = { ...emptyState(), schemaVersion: 1 }
    const fetcher = globals(vi.fn().mockResolvedValue([{ data: oldState }]))
    const loaded = await loadCloud(event)
    expect(loaded.schemaVersion).toBe(2)
    expect(loaded.sessions).toEqual(oldState.sessions)
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/app_state?id=eq.1&select=data',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('maps a database revision conflict to HTTP 409', async () => {
    globals(vi.fn().mockRejectedValue({ data: { code: '40001' } }))
    await expect(saveCloud(event, emptyState(), 0)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('disables cloud access until all server settings exist', () => {
    globals()
    config.cloudEnabled = false
    try { expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 503 })) }
    finally { config.cloudEnabled = true }
  })

  it('rejects a wrong browser access token before querying Supabase', () => {
    const fetcher = globals()
    vi.stubGlobal('getHeader', () => 'Bearer wrong-token')
    expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 401 }))
    expect(fetcher).not.toHaveBeenCalled()
  })
})
