import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { stateSchema, emptyState, type AppState } from '#shared/model'
import { migrateState } from '#repositories/learning'
export function authorizeCloud(event:H3Event){
  const config=useRuntimeConfig(event)
  if(![true,'true'].includes(config.cloudEnabled)||!config.cloudAccessToken||config.cloudAccessToken.length<32||!config.supabaseUrl||!config.supabaseServiceKey)throw createError({statusCode:503,statusMessage:'Cloud storage is disabled'})
  const actual=Buffer.from(getHeader(event,'authorization')??''),expected=Buffer.from(`Bearer ${config.cloudAccessToken}`)
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw createError({statusCode:401,statusMessage:'Access denied'})
  setHeader(event,'Cache-Control','no-store');setHeader(event,'Vary','Authorization')
}
export async function database(event:H3Event,path:string,method:'GET'|'POST',body?:unknown){
  const config=useRuntimeConfig(event)
  try{return await $fetch(`${config.supabaseUrl}/rest/v1/${path}`,{method,headers:{apikey:config.supabaseServiceKey,Authorization:`Bearer ${config.supabaseServiceKey}`},...(body?{body}:{}),timeout:15000})}catch(e){const err=e as {data?:{code?:string}};if(err.data?.code==='40001')throw createError({statusCode:409,statusMessage:'Revision conflict'});throw createError({statusCode:502,statusMessage:'Cloud database request failed'})}
}
export async function loadCloud(event:H3Event):Promise<AppState>{const rows=await database(event,'app_state?id=eq.1&select=data','GET') as {data:unknown}[];return rows[0]?migrateState(rows[0].data):emptyState()}
export async function saveCloud(event:H3Event,state:AppState,revision:number){const parsed=stateSchema.parse({...state,revision:revision+1});await database(event,'rpc/save_learning_state','POST',{next_state:parsed,expected_revision:revision});return parsed}
export async function validatedBody(event:H3Event){const length=Number(getHeader(event,'content-length')??0);if(length>10*1024*1024)throw createError({statusCode:413,statusMessage:'Backup too large'});const text=await readRawBody(event)??'';if(Buffer.byteLength(text)>10*1024*1024)throw createError({statusCode:413,statusMessage:'Backup too large'});try{return JSON.parse(text)}catch{throw createError({statusCode:400,statusMessage:'Invalid JSON'})}}
