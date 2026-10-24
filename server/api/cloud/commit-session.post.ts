import { z } from 'zod'
import { cloudCommitSchema, CloudMergeConflict, mergeCloudCommit } from '#domain/cloud-sync'
import { authorizeCloud, loadCloud, saveCloud, validatedBody } from '../../utils/cloud'

export default defineEventHandler(async event=>{
  authorizeCloud(event)
  const parsed=cloudCommitSchema.safeParse(await validatedBody(event))
  if(!parsed.success)throw createError({statusCode:400,statusMessage:'Invalid session commit'})
  for(let attempt=0;attempt<3;attempt++){
    const current=await loadCloud(event)
    try {
      const merged=mergeCloudCommit(current,parsed.data)
      if(merged===current)return current
      return await saveCloud(event,merged,current.revision)
    }catch(error){
      if(error instanceof CloudMergeConflict)throw createError({statusCode:409,statusMessage:error.message})
      if(error instanceof z.ZodError)throw createError({statusCode:400,statusMessage:'Invalid session data'})
      if((error as {statusCode?:number}).statusCode===409&&attempt<2)continue
      throw error
    }
  }
  throw createError({statusCode:409,statusMessage:'Revision conflict'})
})
