import { openDB, type IDBPDatabase } from 'idb'
import { stateSchema, sessionSchema, reviewQueueItemSchema, type Session, type ReviewQueueItem } from '#shared/model'
import { z } from 'zod'
import { sameJson } from '#domain/cloud-sync'

export const cloudDraftSchema=z.object({
  sessionId:z.string(),
  commitId:z.string().uuid(),
  baseSession:sessionSchema,
  baseReviews:z.array(reviewQueueItemSchema),
  state:stateSchema,
  shouldSync:z.boolean(),
})
export type CloudDraft=z.infer<typeof cloudDraftSchema>
export type CloudCommit={sessionId:string;commitId:string;baseSession:Session;session:Session;baseReviews:ReviewQueueItem[];changedReviews:ReviewQueueItem[]}

export function cloudCommit(draft:CloudDraft):CloudCommit{
  const base=new Map(draft.baseReviews.map(item=>[item.id,item]))
  return {sessionId:draft.sessionId,commitId:draft.commitId,baseSession:draft.baseSession,session:draft.state.sessions.find(item=>item.id===draft.sessionId)!,baseReviews:draft.baseReviews,changedReviews:draft.state.reviewQueue.filter(item=>!sameJson(base.get(item.id),item))}
}

export class CloudDraftRepository {
  private database?:Promise<IDBPDatabase>
  private db(){return this.database??=openDB('afsr-math-cloud-draft-v1',1,{upgrade(db){db.createObjectStore('draft')}})}
  async load():Promise<CloudDraft|undefined>{const value=await (await this.db()).get('draft','main');return value?cloudDraftSchema.parse(value):undefined}
  async save(draft:CloudDraft){await (await this.db()).put('draft',draft,'main')}
  async clear(){await (await this.db()).delete('draft','main')}
}
