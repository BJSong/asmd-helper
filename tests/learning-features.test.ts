import { describe, expect, it } from 'vitest'
import { emptyState, presets, type Session } from '../shared/model'
import { dailySession, freeSession, queueWrongAnswer, scheduleReviews, submit, submitSpacedReview, weaknessRecommendations, grade } from '../domain/learning'
import { makeQuestion } from '../domain/arithmetic'
import { parseBackup } from '../repositories/learning'

describe('학습 효과 보완 규칙',()=>{
  it('실제 새 세션만 회차를 올리고, 오답은 다음 세션 및 3회차 뒤 확인으로 예약한다',()=>{
    const state=emptyState(),settings={...presets.basic,count:1},first=freeSession(settings),q=first.questions[0]!
    scheduleReviews(state,first);expect(state.sessionCounter).toBe(1)
    const wrong=submit(first,q.id,{value:q.answer+1},100);queueWrongAnswer(state,wrong,q,wrong.attempts[0]!)
    expect(state.reviewQueue[0]!.dueSession).toBe(2)
    const second=freeSession(settings);scheduleReviews(state,second);expect(second.scheduledReviewIds).toEqual([state.reviewQueue[0]!.id])
    submitSpacedReview(state,second.id,state.reviewQueue[0]!.id,{value:q.answer},100)
    expect(state.reviewQueue[0]!.dueSession).toBe(5)
    for(let i=0;i<2;i++){const session=freeSession(settings);scheduleReviews(state,session);expect(session.scheduledReviewIds).toHaveLength(0)}
    const fifth=freeSession(settings);scheduleReviews(state,fifth);expect(fifth.scheduledReviewIds).toEqual([state.reviewQueue[0]!.id])
    submitSpacedReview(state,fifth.id,state.reviewQueue[0]!.id,{value:q.answer},100);expect(state.reviewQueue[0]!.status).toBe('mastered')
  })
  it('간격 복습에서 다시 틀리면 다음 새 세션에 배정하고 같은 세션 재개 위치를 보존한다',()=>{
    const state=emptyState(),settings={...presets.basic,count:1},first=freeSession(settings),q=first.questions[0]!;scheduleReviews(state,first)
    const wrong=submit(first,q.id,{value:q.answer+1},10);queueWrongAnswer(state,wrong,q,wrong.attempts[0]!)
    const second=freeSession(settings);scheduleReviews(state,second);const id=second.scheduledReviewIds[0]!;expect(state.sessionCounter).toBe(2)
    for(let i=0;i<3;i++)submitSpacedReview(state,second.id,id,{value:q.answer+1},5)
    expect(state.reviewQueue[0]!.status).toBe('due');expect(state.reviewQueue[0]!.dueSession).toBe(3)
    const third=freeSession(settings);scheduleReviews(state,third);expect(third.scheduledReviewIds).toEqual([id]);expect(state.reviewQueue[0]!.attemptsThisSession).toBe(0)
  })
  it('같은 미해결 문제는 큐에 한 번만 들어가고 복습 상한을 지킨다',()=>{
    const state=emptyState();state.reviewQuestionLimit=1;const settings={...presets.basic,count:2},session=freeSession(settings);scheduleReviews(state,session)
    for(const q of session.questions){const attempt={questionId:q.id,answer:{value:q.answer+1},correct:false,durationMs:10,inactiveMs:0,submittedAt:new Date().toISOString()};queueWrongAnswer(state,session,q,attempt)}
    const duplicate=session.questions[0]!;queueWrongAnswer(state,session,duplicate,{questionId:duplicate.id,answer:{value:duplicate.answer+1},correct:false,durationMs:10,inactiveMs:0,submittedAt:new Date().toISOString()})
    expect(state.reviewQueue).toHaveLength(2)
    const next=freeSession(settings);scheduleReviews(state,next);expect(next.scheduledReviewIds).toHaveLength(1)
  })
  it('유형별 3문제 미만은 추천하지 않고 최근 5개 세션 첫 답안만 분석한다',()=>{
    const plan=emptyState().plan;plan.startDate='2026-10-01';plan.settings={...presets.basic,operators:['add'],count:2,carry:'required',difficulty:'normal'};const low=dailySession(plan,'2026-10-13',()=>0.2)
    let session=low;for(const q of low.questions){session=submit(session,q.id,{value:q.answer+1},100);session=submit(session,q.id,{value:q.answer+1},100,0,'retry');session=submit(session,q.id,{value:q.answer+1},100,0,'retry')}
    expect(weaknessRecommendations([session]).types).toHaveLength(0)
    plan.settings={...presets.basic,operators:['add'],count:3,carry:'required',difficulty:'normal'};const enough=dailySession(plan,'2026-10-14',()=>0.3)
    let completed=enough;for(const q of enough.questions){completed=submit(completed,q.id,{value:q.answer+1},100);completed=submit(completed,q.id,{value:q.answer+1},100,0,'retry');completed=submit(completed,q.id,{value:q.answer+1},100,0,'retry')}
    completed.startedAt='2026-10-14T12:00:00.000Z'
    expect(weaknessRecommendations([completed]).types[0]).toMatchObject({total:3,correct:0,rate:0})
  })
  it('버전 1 백업을 새 버전으로 바꾸면서 이전 세션을 남긴다',()=>{
    const old=emptyState();old.plan.startDate='2026-10-01';const session=dailySession(old.plan,'2026-10-13'),legacySession=JSON.parse(JSON.stringify(session)) as Record<string,unknown>;for(const key of ['hintViews','scheduledReviewIds','spacedReviewPosition','mixedRecognition'])delete legacySession[key]
    const legacy={...old,schemaVersion:1 as const,sessions:[legacySession]};delete (legacy as Record<string,unknown>).sessionCounter;delete (legacy as Record<string,unknown>).reviewQueue
    const migrated=parseBackup(JSON.stringify(legacy));expect(migrated.schemaVersion).toBe(2);expect(migrated.sessions[0]!.questions).toEqual(session.questions);expect(migrated.sessions[0]!.mixedRecognition).toBe(false);expect(migrated.sessionCounter).toBe(1);expect(migrated.reviewQueue).toEqual([])
  })
  it('혼합 답안은 연산 종류까지 맞아야 정답이며 기초 세션 없는 연산은 혼합 후보에서 빠진다',()=>{
    const q=makeQuestion('add',4,3);expect(grade(q,{value:7,operator:'add'},true)).toBe(true);expect(grade(q,{value:7,operator:'subtract'},true)).toBe(false)
    const state=emptyState(),settings={...presets.basic,operators:['add','subtract'] as const,count:1},first=freeSession(settings),wrongOperator=first.questions[0]!.operator==='add'?'subtract':'add'
    const wrong=submit({...first,mixedRecognition:true},first.questions[0]!.id,{value:first.questions[0]!.answer,operator:wrongOperator},100)
    expect(wrong.attempts[0]!.correct).toBe(false)
    const corrected=submit(wrong,first.questions[0]!.id,{value:first.questions[0]!.answer,operator:first.questions[0]!.operator},100,0,'retry')
    expect(corrected.attempts[0]!.correct).toBe(false);expect(corrected.retries[0]!.correct).toBe(true)
  })
  it('최근 5개 세션만으로 표본을 만들고 동률은 가장 최근 오답 유형을 먼저 표시한다',()=>{
    const makeRecord=(id:string,day:string,items:{operator:'add'|'subtract';correct:boolean}[]):Session=>{
      const questions=items.map(({operator},i)=>makeQuestion(operator,operator==='add'?i+1:i+3,operator==='add'?1:1))
      return {id,type:'free',date:day,settings:{...presets.basic,operators:['add','subtract'],count:questions.length},questions,attempts:questions.map((q,i)=>({questionId:q.id,answer:{value:q.answer+(items[i]!.correct?0:1)},correct:items[i]!.correct,durationMs:500,inactiveMs:0,submittedAt:`${day}T12:00:00.000Z`})),retries:[],reviews:[],reviewQuestions:[],reviewAttempts:[],reviewRetries:[],hintViews:[],scheduledReviewIds:[],spacedReviewPosition:0,mixedRecognition:false,retryPolicyVersion:1,startedAt:`${day}T12:00:00.000Z`,completedAt:`${day}T12:10:00.000Z`,status:'completed'}
    }
    const recent:Session[]=[]
    for(let i=0;i<5;i++){const day=`2026-10-${String(15-i).padStart(2,'0')}`,outcomes=i===0?[{operator:'add' as const,correct:true},{operator:'subtract' as const,correct:false}]:i===1?[{operator:'add' as const,correct:false},{operator:'subtract' as const,correct:false}]:i===2?[{operator:'add' as const,correct:false},{operator:'subtract' as const,correct:true}]:[{operator:'add' as const,correct:true},{operator:'subtract' as const,correct:true}];recent.push(makeRecord(String(i),day,outcomes))}
    const old=makeRecord('old','2026-10-01',Array.from({length:4},()=>({operator:'multiply' as never,correct:false})))
    const result=weaknessRecommendations([...recent,old]);expect(result.sessions).toBe(5);expect(result.types).toHaveLength(2);expect(result.types[0]!.key.startsWith('subtract/')).toBe(true)
  })
})
