import { describe, expect, it } from 'vitest'
import { emptyState, presets } from '../shared/model'
import { freeSession, queueWrongAnswer, scheduleReviews, submit, submitSpacedReview } from '../domain/learning'
import { CloudMergeConflict, mergeCloudCommit } from '../domain/cloud-sync'

const commitId='00000000-0000-4000-8000-000000000001'
function scenario(){
  const base=emptyState()
  const session=freeSession({...presets.basic!,count:1,operators:['add']})
  scheduleReviews(base,session)
  base.sessions.push(session)
  const local=structuredClone(base),question=session.questions[0]!
  const answered=submit(session,question.id,{value:question.answer+1},1000)
  local.sessions[0]=answered
  queueWrongAnswer(local,answered,question,answered.attempts[0]!)
  const input={sessionId:session.id,commitId,baseSession:structuredClone(session),session:answered,baseReviews:[],changedReviews:local.reviewQueue}
  return {base,local,input,session}
}

describe('end-of-session cloud merge',()=>{
  it('merges one session without replacing a concurrent plan change',()=>{
    const {base,input,session}=scenario()
    const latest=structuredClone(base)
    latest.plan.updatedAt='2026-10-24T00:00:00.000Z'
    const merged=mergeCloudCommit(latest,input)
    expect(merged.plan.updatedAt).toBe(latest.plan.updatedAt)
    expect(merged.sessions.find(item=>item.id===session.id)?.attempts).toHaveLength(1)
    expect(merged.reviewQueue).toHaveLength(1)
    expect(merged.sessions[0]?.syncCommitIds).toContain(commitId)
  })

  it('does not add a duplicate answer or review when the commit is retried',()=>{
    const {base,input}=scenario()
    const merged=mergeCloudCommit(base,input)
    expect(mergeCloudCommit(merged,input)).toBe(merged)
    expect(merged.sessions[0]?.attempts).toHaveLength(1)
    expect(merged.reviewQueue).toHaveLength(1)
  })

  it('keeps a newly wrong problem due after concurrent sessions have started',()=>{
    const {base,input}=scenario()
    const latest=structuredClone(base)
    const other=freeSession({...presets.basic!,count:1,operators:['add']})
    scheduleReviews(latest,other)
    latest.sessions.push(other)
    const merged=mergeCloudCommit(latest,input)
    expect(merged.reviewQueue[0]?.dueSession).toBe(latest.sessionCounter+1)
  })

  it('rejects an edit to the same session or its fixed questions',()=>{
    const {base,input}=scenario()
    const changed=structuredClone(base)
    changed.sessions[0]!.startedAt='2026-10-24T00:00:00.000Z'
    expect(()=>mergeCloudCommit(changed,input)).toThrow(CloudMergeConflict)
    const tampered=structuredClone(input)
    tampered.session.startedAt='2026-10-24T00:00:00.000Z'
    expect(()=>mergeCloudCommit(base,tampered)).toThrow(CloudMergeConflict)
  })

  it('merges spaced review attempts and their saved position',()=>{
    const first=scenario()
    const base=structuredClone(first.local)
    const reviewSession=freeSession({...presets.basic!,count:1,operators:['add']})
    scheduleReviews(base,reviewSession)
    base.sessions.push(reviewSession)
    const local=structuredClone(base),item=local.reviewQueue[0]!
    submitSpacedReview(local,reviewSession.id,item.id,{value:item.question.answer},500)
    local.sessions.at(-1)!.spacedReviewPosition=1
    const input={sessionId:reviewSession.id,commitId:'00000000-0000-4000-8000-000000000002',baseSession:reviewSession,session:local.sessions.at(-1)!,baseReviews:base.reviewQueue,changedReviews:local.reviewQueue}
    const merged=mergeCloudCommit(base,input)
    expect(merged.reviewQueue[0]?.attempts).toHaveLength(1)
    expect(merged.reviewQueue[0]?.status).toBe('scheduled')
    expect(merged.sessions.at(-1)?.spacedReviewPosition).toBe(1)
  })
})
