import type { H3Event } from 'h3'
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { stateSchema, emptyState, type AppState } from '#shared/model'
import { migrateState } from '#repositories/learning'
export function cloudStorageMode(event:H3Event):'local'|'cloud'{
  const config=useRuntimeConfig(event)
  if(![true,'true'].includes(config.cloudEnabled))return 'local'
  if(!config.cloudAccessToken||config.cloudAccessToken.length<16||!config.supabaseUrl||!config.supabaseServiceKey)
    throw createError({statusCode:503,statusMessage:'Cloud storage requires family access password and server settings'})
  return 'cloud'
}
const SESSION_AGE_SECONDS=30*24*60*60
const SESSION_COOKIE='asmd_session'
function signature(event:H3Event,payload:string){
  const config=useRuntimeConfig(event)
  const signingKey=createHmac('sha256',config.supabaseServiceKey).update(`asmd-family-session-v1:${config.cloudAccessToken}`).digest()
  return createHmac('sha256',signingKey).update(payload).digest('hex')
}
export function createFamilySession(event:H3Event){
  if(cloudStorageMode(event)!=='cloud')throw createError({statusCode:503,statusMessage:'Cloud storage is disabled'})
  const payload=`v1.${Date.now()+SESSION_AGE_SECONDS*1000}.${randomBytes(16).toString('hex')}`
  setCookie(event,SESSION_COOKIE,`${payload}.${signature(event,payload)}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:SESSION_AGE_SECONDS})
  setHeader(event,'Cache-Control','no-store')
}
export function clearFamilySession(event:H3Event){deleteCookie(event,SESSION_COOKIE,{path:'/'})}
export function hasFamilySession(event:H3Event):boolean{
  const parts=(getCookie(event,SESSION_COOKIE)??'').split('.')
  if(parts.length!==4||parts[0]!=='v1')return false
  const expiry=Number(parts[1])
  if(!Number.isSafeInteger(expiry)||expiry<=Date.now()||expiry>Date.now()+SESSION_AGE_SECONDS*1000)return false
  const payload=parts.slice(0,3).join('.'),actual=Buffer.from(parts[3]??'','hex'),expected=Buffer.from(signature(event,payload),'hex')
  return actual.length===expected.length&&timingSafeEqual(actual,expected)
}
export function authorizeCloud(event:H3Event){
  if(cloudStorageMode(event)!=='cloud')throw createError({statusCode:503,statusMessage:'Cloud storage is disabled'})
  if(!hasFamilySession(event))throw createError({statusCode:401,statusMessage:'Family sign-in required'})
  setHeader(event,'Cache-Control','no-store')
}
export async function database(event:H3Event,path:string,method:'GET'|'POST',body?:unknown){
  const config=useRuntimeConfig(event)
  const headers:Record<string,string>={apikey:config.supabaseServiceKey}
  if(!config.supabaseServiceKey.startsWith('sb_secret_'))headers.Authorization=`Bearer ${config.supabaseServiceKey}`
  try{return await $fetch(`${config.supabaseUrl}/rest/v1/${path}`,{method,headers,...(body?{body}:{}),timeout:15000})}catch(e){const err=e as {data?:{code?:string}};if(err.data?.code==='40001')throw createError({statusCode:409,statusMessage:'Revision conflict'});throw createError({statusCode:502,statusMessage:'Cloud database request failed'})}
}
export async function loadCloud(event:H3Event):Promise<AppState>{const rows=await database(event,'app_state?id=eq.1&select=data','GET') as {data:unknown}[];return rows[0]?migrateState(rows[0].data):emptyState()}
export async function saveCloud(event:H3Event,state:AppState,revision:number){const parsed=stateSchema.parse({...state,revision:revision+1});await database(event,'rpc/save_learning_state','POST',{next_state:parsed,expected_revision:revision});return parsed}
export async function validatedBody(event:H3Event){const length=Number(getHeader(event,'content-length')??0);if(length>10*1024*1024)throw createError({statusCode:413,statusMessage:'Backup too large'});const text=await readRawBody(event)??'';if(Buffer.byteLength(text)>10*1024*1024)throw createError({statusCode:413,statusMessage:'Backup too large'});try{return JSON.parse(text)}catch{throw createError({statusCode:400,statusMessage:'Invalid JSON'})}}
