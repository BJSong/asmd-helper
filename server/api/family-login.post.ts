import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { cloudStorageMode, createFamilySession } from '../utils/cloud'

export default defineEventHandler(async event=>{
  if(cloudStorageMode(event)!=='cloud')throw createError({statusCode:503,statusMessage:'Cloud storage is disabled'})
  const input=z.object({password:z.string().max(1000)}).safeParse(await readBody(event))
  if(!input.success)throw createError({statusCode:400,statusMessage:'Invalid sign-in request'})
  const expected=Buffer.from(useRuntimeConfig(event).cloudAccessToken),actual=Buffer.from(input.data.password)
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw createError({statusCode:401,statusMessage:'Incorrect family password'})
  createFamilySession(event)
  return {ok:true}
})
