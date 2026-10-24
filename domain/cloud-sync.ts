import { z } from 'zod'
import { stateSchema, sessionSchema, reviewQueueItemSchema, type AppState, type Session, type ReviewQueueItem } from '#shared/model'

export const cloudCommitSchema=z.object({sessionId:z.string(),commitId:z.string().uuid(),baseSession:sessionSchema,session:sessionSchema,baseReviews:z.array(reviewQueueItemSchema).max(500),changedReviews:z.array(reviewQueueItemSchema).max(500)})
export type CloudCommitInput=z.infer<typeof cloudCommitSchema>
export class CloudMergeConflict extends Error {constructor(){super('같은 학습 기록이 다른 기기에서 변경됐어요. 이 기기의 답안은 보관되어 있습니다.')}}
export function sameJson(a:unknown,b:unknown):boolean{
  if(a===b)return true
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameJson(value,b[index]))
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left)
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameJson(left[key],right[key]))
}
function immutable(session:Session){const {attempts,retries,reviews,reviewQuestions,reviewAttempts,reviewRetries,hintViews,spacedReviewPosition,status,completedAt,syncCommitIds,...rest}=session;return rest}

export function mergeCloudCommit(current:AppState,input:CloudCommitInput):AppState{
  if(input.sessionId!==input.baseSession.id||input.sessionId!==input.session.id||!sameJson(immutable(input.baseSession),immutable(input.session)))throw new CloudMergeConflict()
  const index=current.sessions.findIndex(item=>item.id===input.sessionId)
  if(index<0)throw new CloudMergeConflict()
  const existing=current.sessions[index]!
  if(existing.syncCommitIds.includes(input.commitId))return current
  if(!sameJson(existing,input.baseSession))throw new CloudMergeConflict()
  const baseReviews=new Map(input.baseReviews.map(item=>[item.id,item]))
  if(baseReviews.size!==input.baseReviews.length||new Set(input.changedReviews.map(item=>item.id)).size!==input.changedReviews.length)throw new CloudMergeConflict()
  const next=structuredClone(current)
  next.sessions[index]={...input.session,syncCommitIds:[...existing.syncCommitIds,input.commitId].slice(-100)}
  for(const item of input.changedReviews){
    const before=baseReviews.get(item.id),currentIndex=next.reviewQueue.findIndex(candidate=>candidate.id===item.id)
    if(before){
      if(currentIndex<0||sameJson(before,item)||!sameJson(next.reviewQueue[currentIndex],before))throw new CloudMergeConflict()
      if(before.assignedSessionId!==input.sessionId)throw new CloudMergeConflict()
    }else if(currentIndex>=0||item.sourceSessionId!==input.sessionId)throw new CloudMergeConflict()
    const updated=structuredClone(item)
    if(updated.status!=='mastered'&&!updated.assignedSessionId&&updated.dueSession<=next.sessionCounter)updated.dueSession=next.sessionCounter+1
    if(currentIndex>=0)next.reviewQueue[currentIndex]=updated
    else next.reviewQueue.push(updated)
  }
  return stateSchema.parse(next)
}
