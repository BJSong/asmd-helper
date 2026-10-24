import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../shared/model'
import { authorizeCloud, cloudStorageMode, createFamilySession, loadCloud, saveCloud } from '../server/utils/cloud'

const event = {} as Parameters<typeof authorizeCloud>[0]
const config = {
  cloudEnabled: true,
  cloudAccessToken: 'a'.repeat(32),
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceKey: 'server-only-test-key',
}

function globals(fetcher = vi.fn()) {
  let sessionCookie=''
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('setCookie', (_event:unknown,_name:string,value:string)=>{sessionCookie=value})
  vi.stubGlobal('getCookie', ()=>sessionCookie)
  vi.stubGlobal('setHeader', vi.fn())
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
  vi.stubGlobal('$fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('cloud API to database contract', () => {
  it('keeps the service key server-side and sends the expected revisioned snapshot', async () => {
    const fetcher = globals(vi.fn().mockResolvedValue(1))
    createFamilySession(event)
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

  it('sends a modern Supabase secret key only as apikey', async () => {
    config.supabaseServiceKey = 'sb_secret_test-key'
    try {
      const fetcher = globals(vi.fn().mockResolvedValue([]))
      await loadCloud(event)
      expect(fetcher).toHaveBeenCalledWith(
        'https://example.supabase.co/rest/v1/app_state?id=eq.1&select=data',
        expect.objectContaining({ headers: { apikey: config.supabaseServiceKey } }),
      )
    } finally { config.supabaseServiceKey = 'server-only-test-key' }
  })

  it('maps a database revision conflict to HTTP 409', async () => {
    globals(vi.fn().mockRejectedValue({ data: { code: '40001' } }))
    await expect(saveCloud(event, emptyState(), 0)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('uses local mode only when cloud is explicitly disabled', () => {
    globals()
    config.cloudEnabled = false
    try {
      expect(cloudStorageMode(event)).toBe('local')
      expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 503 }))
    }
    finally { config.cloudEnabled = true }
  })

  it('requires a signed family session before database access', () => {
    const fetcher = globals()
    expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 401 }))
    expect(fetcher).not.toHaveBeenCalled()
    createFamilySession(event)
    expect(() => authorizeCloud(event)).not.toThrow()
  })

  it('fails closed when cloud credentials are incomplete', () => {
    globals()
    const key=config.supabaseServiceKey
    config.supabaseServiceKey = ''
    try { expect(() => cloudStorageMode(event)).toThrowError(expect.objectContaining({ statusCode: 503 })) }
    finally { config.supabaseServiceKey=key }
  })

  it('accepts a 16-character family passphrase and rejects a short password', () => {
    globals()
    const oldPassword=config.cloudAccessToken
    try {
      config.cloudAccessToken='가'.repeat(16)
      expect(cloudStorageMode(event)).toBe('cloud')
      config.cloudAccessToken='123456'
      expect(() => cloudStorageMode(event)).toThrowError(expect.objectContaining({statusCode:503}))
    } finally { config.cloudAccessToken=oldPassword }
  })

  it('returns a configuration error when the deployment parses the family password as a number', async () => {
    globals()
    vi.stubGlobal('defineEventHandler',(handler:unknown)=>handler)
    vi.stubGlobal('readBody',async()=>({password:'123456'}))
    const {default:login}=await import('../server/api/family-login.post')
    const oldPassword=config.cloudAccessToken
    try {
      config.cloudAccessToken=123456 as unknown as string
      expect(() => cloudStorageMode(event)).toThrowError(expect.objectContaining({statusCode:503}))
      await expect(login(event)).rejects.toMatchObject({statusCode:503})
    } finally { config.cloudAccessToken=oldPassword }
  })

  it('rejects a tampered family session', () => {
    globals()
    createFamilySession(event)
    vi.stubGlobal('getCookie', ()=>'v1.9999999999999.fake.'+'0'.repeat(64))
    expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 401 }))
  })

  it('invalidates family sessions when the family password changes', () => {
    globals()
    createFamilySession(event)
    const oldPassword=config.cloudAccessToken
    try {
      config.cloudAccessToken='b'.repeat(16)
      expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({statusCode:401}))
    } finally { config.cloudAccessToken=oldPassword }
  })

  it('rejects an expired family session', () => {
    globals()
    createFamilySession(event)
    const now=Date.now()
    vi.spyOn(Date,'now').mockReturnValue(now+31*24*60*60*1000)
    try { expect(() => authorizeCloud(event)).toThrowError(expect.objectContaining({ statusCode: 401 })) }
    finally { vi.restoreAllMocks() }
  })

  it('sets a protected cookie only after the correct family password', async () => {
    globals()
    vi.stubGlobal('defineEventHandler',(handler:unknown)=>handler)
    const cookie=vi.fn()
    vi.stubGlobal('setCookie',cookie)
    const {default:login}=await import('../server/api/family-login.post')
    vi.stubGlobal('readBody',async()=>({password:'wrong'}))
    await expect(login(event)).rejects.toMatchObject({statusCode:401})
    expect(cookie).not.toHaveBeenCalled()
    vi.stubGlobal('readBody',async()=>({password:config.cloudAccessToken}))
    await expect(login(event)).resolves.toEqual({ok:true})
    expect(cookie).toHaveBeenCalledWith(event,'asmd_session',expect.any(String),expect.objectContaining({httpOnly:true,sameSite:'strict',path:'/',maxAge:30*24*60*60}))
  })
})
