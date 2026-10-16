import { z } from 'zod'
import { stateSchema,planSchema,settingsSchema,answerSchema,emptyState,seoulDate } from '#shared/model'
import { dailySession,freeSession,submit,scheduleReviews,queueWrongAnswer,submitSpacedReview } from '#domain/learning'
import { authorizeCloud,loadCloud,saveCloud,validatedBody } from '../../utils/cloud'
export default defineEventHandler(async event=>{
  authorizeCloud(event)
  const path=getRouterParam(event,'path')??'',method=getMethod(event)
  if(method==='GET') {const current=await loadCloud(event);if(path==='state')return current;if(path==='plan')return current.plan;if(path==='sessions'||path==='history')return current.sessions;if(path==='assignments')return current.sessions.filter(s=>s.type==='daily');throw createError({statusCode:404})}
  try {
    const body=await validatedBody(event)
    if(path==='state'&&method==='PUT'){const input=z.object({state:stateSchema,expectedRevision:z.number().int().nonnegative()}).parse(body);return saveCloud(event,input.state,input.expectedRevision)}
    if(path==='state'&&method==='DELETE'){const input=z.object({expectedRevision:z.number().int().nonnegative()}).parse(body);return saveCloud(event,emptyState(),input.expectedRevision)}
    const current=await loadCloud(event)
    const {expectedRevision}=z.object({expectedRevision:z.number().int().nonnegative()}).parse(body)
    if(current.revision!==expectedRevision)throw createError({statusCode:409,statusMessage:'Revision conflict'})
    if(path==='plan'&&method==='PUT'){current.plan=planSchema.parse(body.plan);current.onboarded=true}
    else if(path==='assignments'&&method==='POST'){if(!current.sessions.some(s=>s.id===`daily-${seoulDate()}`)){const session=dailySession(current.plan);scheduleReviews(current,session);current.sessions.push(session)}}
    else if(path==='sessions'&&method==='POST'){const input=z.object({settings:settingsSchema,lastSettings:settingsSchema.optional(),mixedRecognition:z.boolean().default(false)}).parse(body),trained=new Set(current.sessions.flatMap(s=>s.questions.filter(q=>s.attempts.some(a=>a.questionId===q.id)).map(q=>q.operator))),selected=input.mixedRecognition?{...input.settings,operators:input.settings.operators.filter(op=>trained.has(op))}:input.settings;if(input.mixedRecognition&&selected.operators.length<2)throw createError({statusCode:400,statusMessage:'Insufficient mixed-practice history'});const session=freeSession(selected,input.mixedRecognition);scheduleReviews(current,session);current.sessions.push(session);current.lastSettings=structuredClone(input.lastSettings??input.settings)}
    else if(/^sessions\/[^/]+\/spaced-reviews$/.test(path)&&method==='POST'){
      const input=z.object({reviewId:z.string(),answer:answerSchema,durationMs:z.number().int().min(0).max(86400000)}).parse(body),id=path.split('/')[1]??'',session=current.sessions.find(s=>s.id===id)
      if(!session)throw createError({statusCode:404});submitSpacedReview(current,id,input.reviewId,input.answer,input.durationMs)
    }
    else if(/^sessions\/[^/]+\/(answers|retries|reviews|review-retries)$/.test(path)&&method==='POST'){
      const input=z.object({questionId:z.string(),answer:answerSchema,durationMs:z.number().int().min(0).max(86400000),inactiveMs:z.number().int().min(0).max(86400000).default(0)}).parse(body)
      const id=path.split('/')[1],index=current.sessions.findIndex(s=>s.id===id);if(index<0)throw createError({statusCode:404});const kind=path.endsWith('/review-retries')?'reviewRetry':path.endsWith('/reviews')?'review':path.endsWith('/retries')?'retry':'first';const before=current.sessions[index]!,after=submit(before,input.questionId,input.answer,input.durationMs,input.inactiveMs,kind);current.sessions[index]=after;if(kind==='first'){const attempt=after.attempts.find(a=>a.questionId===input.questionId)!;queueWrongAnswer(current,after,after.questions.find(q=>q.id===input.questionId)!,attempt)}
    }else throw createError({statusCode:404})
    return saveCloud(event,current,expectedRevision)
  }catch(e){if(e instanceof z.ZodError)throw createError({statusCode:400,statusMessage:'Invalid learning data'});throw e}
})
