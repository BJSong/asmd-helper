import { type AppState, type Plan, type Session, type Settings, type Answer, type Attempt, type Question, type ReviewQueueItem, seoulDate } from '#shared/model'
import { generateQuestions } from '#domain/arithmetic'
export function allocate(count:number,ratios: readonly number[]=[25,50,25]):number[] {
  if(!Number.isSafeInteger(count)||count<1||ratios.length!==3||ratios.some(n=>!Number.isFinite(n)||n<0)||ratios.reduce((a,b)=>a+b,0)!==100)return [0,0,0]
  const raw=ratios.map(r=>count*r/100), result=raw.map(Math.floor)
  const order=[0,1,2].sort((a,b)=>(raw[b]!-result[b]!)-(raw[a]!-result[a]!)||[1,0,2].indexOf(a)-[1,0,2].indexOf(b))
  const remaining=count-result.reduce((a,b)=>a+b,0)
  for(const i of order.slice(0,remaining))result[i]!++
  return result
}
export function weekday(date:string):number{return new Date(`${date}T12:00:00+09:00`).getUTCDay()}
export function scheduled(plan:Plan,date:string):boolean{return date>=plan.startDate&&plan.weekdays.includes(weekday(date))}
export function dailySession(plan:Plan,date=seoulDate(),rng=Math.random):Session {
  if(!scheduled(plan,date))throw new Error('이 날짜는 쉬는 날이에요. 자유 학습은 언제든 할 수 있어요.')
  const settings=structuredClone(plan.weekdaySettings[String(weekday(date))]??plan.settings)
  settings.count=plan.settings.count
  const questions=generateQuestions(settings,rng)
  return {id:`daily-${date}`,type:'daily',date,settings,planSnapshot:structuredClone(plan),questions,attempts:[],retries:[],reviews:[],reviewQuestions:[],reviewAttempts:[],reviewRetries:[],hintViews:[],scheduledReviewIds:[],spacedReviewPosition:0,mixedRecognition:false,retryPolicyVersion:1,startedAt:new Date().toISOString(),status:'in-progress'}
}
export function freeSession(settings:Settings,mixedRecognition=false):Session {return {id:crypto.randomUUID(),type:'free',date:seoulDate(),settings:structuredClone(settings),questions:generateQuestions(settings),attempts:[],retries:[],reviews:[],reviewQuestions:[],reviewAttempts:[],reviewRetries:[],hintViews:[],scheduledReviewIds:[],spacedReviewPosition:0,mixedRecognition,retryPolicyVersion:1,startedAt:new Date().toISOString(),status:'in-progress'}}
export function scheduleReviews(state:AppState,session:Session){
  state.sessionCounter++
  const due=state.reviewQueue.filter(x=>x.status!=='mastered'&&!x.assignedSessionId&&x.dueSession<=state.sessionCounter).sort((a,b)=>a.firstWrongAt.localeCompare(b.firstWrongAt)||a.interval-b.interval).slice(0,state.reviewQuestionLimit)
  for(const item of due){for(const other of state.sessions){const index=other.scheduledReviewIds.indexOf(item.id);if(index>=0){other.scheduledReviewIds.splice(index,1);if(index<other.spacedReviewPosition)other.spacedReviewPosition--}}item.status='scheduled';item.assignedSessionId=session.id;item.attemptsThisSession=0;item.lastAttemptSession=state.sessionCounter}
  session.scheduledReviewIds=due.map(x=>x.id)
}
export function queueWrongAnswer(state:AppState,session:Session,question:Question,attempt:Attempt){
  if(attempt.correct||state.reviewQueue.some(x=>x.sourceQuestionId===question.id&&x.status!=='mastered'))return
  const now=attempt.submittedAt
  const item:ReviewQueueItem={id:`${session.id}:${question.id}`,sourceSessionId:session.id,sourceQuestionId:question.id,question:structuredClone(question),firstWrongAt:now,dueSession:state.sessionCounter+1,interval:1,status:'due',attempts:[],hintViews:[],lastAttemptSession:0,attemptsThisSession:0,createdAt:now}
  state.reviewQueue.push(item)
}
export function submitSpacedReview(state:AppState,sessionId:string,itemId:string,answer:Answer,durationMs:number){
  const item=state.reviewQueue.find(x=>x.id===itemId);if(!item||item.status==='mastered'||item.assignedSessionId!==sessionId||item.lastAttemptSession!==state.sessionCounter||item.attemptsThisSession>=3||(item.attemptsThisSession>0&&item.attempts.at(-1)?.correct))throw new Error('복습 문제를 찾을 수 없어요.')
  const correct=grade(item.question,answer),attempt:Attempt={questionId:item.question.id,answer,correct,durationMs:Math.max(0,Math.round(durationMs)),inactiveMs:0,submittedAt:new Date().toISOString()}
  item.attempts.push(attempt)
  item.attemptsThisSession++
  if(!correct){item.status='due';item.interval=1;item.dueSession=state.sessionCounter+1;if(item.attemptsThisSession>=3)item.assignedSessionId=undefined}
  else {item.assignedSessionId=undefined;if(item.interval===1){item.status='scheduled';item.interval=3;item.dueSession=state.sessionCounter+3}else item.status='mastered'}
  return attempt
}
export type WeakType={key:string;label:string;total:number;correct:number;rate:number;recentWrong:number}
export function weaknessRecommendations(sessions:Session[]):{sessions:number;types:WeakType[]} {
  const recent=sessions.filter(s=>s.status==='completed'&&s.attempts.length).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,5),map=new Map<string,WeakType>()
  for(const [index,s] of recent.entries())for(const q of s.questions){const key=`${q.operator}/${q.digitsA}/${q.digitsB}/${q.difficulty}/${q.carryBorrowType}`,label=`${({add:'덧셈',subtract:'뺄셈',multiply:'곱셈',divide:'나눗셈'})[q.operator]} · ${q.digitsA}/${q.digitsB}자리 · ${q.difficulty}${q.carryBorrowType==='required'?' · 받아올림/내림':''}`,row=map.get(key)??{key,label,total:0,correct:0,rate:0,recentWrong:0};row.total++;if(s.attempts.find(a=>a.questionId===q.id)?.correct)row.correct++;else row.recentWrong=Math.max(row.recentWrong,6-index);map.set(key,row)}
  const eligible=[...map.values()].filter(x=>x.total>=3).map(x=>({...x,rate:Math.round(x.correct/x.total*100)})).sort((a,b)=>a.rate-b.rate||b.recentWrong-a.recentWrong).slice(0,2)
  return {sessions:recent.length,types:eligible}
}
export function grade(q:Question,a:Answer,requireOperator=false):boolean {return a.value===q.answer&&(q.operator!=='divide'||(a.remainder??0)===q.remainder)&&(!requireOperator||a.operator===q.operator)}
export type SubmissionKind='first'|'retry'|'review'|'reviewRetry'
export function retryCount(s:Session,questionId:string){return s.retries.filter(a=>a.questionId===questionId).length}
export function reviewRetryCount(s:Session,questionId:string){return s.reviewRetries.filter(a=>a.questionId===questionId).length}
export function reviewResolved(s:Session,questionId:string){const first=s.reviewAttempts.find(a=>a.questionId===questionId);return !!first&&(first.correct||s.reviewRetries.some(a=>a.questionId===questionId&&a.correct)||reviewRetryCount(s,questionId)>=2)}
export function resolved(s:Session,questionId:string){if(s.retryPolicyVersion!==1&&s.status==='completed')return true;const first=s.attempts.find(a=>a.questionId===questionId);return !!first&&(first.correct||s.retries.some(a=>a.questionId===questionId&&a.correct)||retryCount(s,questionId)>=2)}
export function nextPosition(s:Session){const index=s.questions.findIndex(q=>!resolved(s,q.id));return index<0?s.questions.length:index}
function buildReviewQuestions(s:Session,rng:()=>number):Session['reviewQuestions'] {
  const unresolvedWrong=s.attempts.filter(a=>!a.correct&&!s.retries.some(r=>r.questionId===a.questionId&&r.correct)&&retryCount(s,a.questionId)>=2)
  const used=new Set(s.questions.map(q=>q.id))
  return unresolvedWrong.map(attempt=>{
    const source=s.questions.find(q=>q.id===attempt.questionId)!
    const input:Settings={...s.settings,operators:[source.operator],digitsA:source.digitsA,digitsB:source.digitsB,difficulty:source.difficulty,carry:source.operator==='divide'?'any':source.carryBorrowType==='required'?'required':'none',count:1}
    let question:Question
    try {question=generateQuestions(input,rng,used)[0]!} catch {
      try {question=generateQuestions({...input,carry:'any'},rng,used)[0]!} catch {question=source}
    }
    used.add(question.id)
    return {sourceQuestionId:source.id,question}
  })
}
export function submit(s:Session,questionId:string,answer:Answer,durationMs:number,inactiveMs=0,kind:SubmissionKind='first',rng=Math.random):Session {
  const next=structuredClone(s),q=s.questions.find(q=>q.id===questionId)
  const reviewQuestion=kind==='review'||kind==='reviewRetry'?s.reviewQuestions.find(x=>x.question.id===questionId)?.question:undefined
  const target=reviewQuestion??q
  if(!target)throw new Error('문제를 찾을 수 없어요.')
  if(kind==='review'||kind==='reviewRetry'){
    if(!s.reviewQuestions.some(x=>x.question.id===questionId)&&!s.attempts.some(a=>a.questionId===questionId&&!a.correct))throw new Error('오답 문제만 복습할 수 있어요.')
    if(reviewQuestion&&kind==='review'&&s.reviewAttempts.some(a=>a.questionId===questionId))return next
    if(reviewQuestion&&kind==='reviewRetry'&&(!s.reviewAttempts.some(a=>a.questionId===questionId&&!a.correct)||reviewRetryCount(s,questionId)>=2))throw new Error('다시 풀 수 있는 횟수를 모두 사용했어요.')
    if(!reviewQuestion&&s.reviews.some(a=>a.questionId===questionId))return next
  } else {
    if(!q)throw new Error('문제를 찾을 수 없어요.')
    if(q.id!==s.questions[nextPosition(s)]?.id)throw new Error('학습 위치가 바뀌었어요. 다시 열어 주세요.')
    if(kind==='first'&&s.attempts.some(a=>a.questionId===questionId))return next
    if(kind==='retry'&&(!s.attempts.some(a=>a.questionId===questionId&&!a.correct)||retryCount(s,questionId)>=2))throw new Error('다시 풀 수 있는 횟수를 모두 사용했어요.')
  }
  const attempt:Attempt={questionId,answer,correct:grade(target,answer,s.retryPolicyVersion===1&&s.mixedRecognition&&!['review','reviewRetry'].includes(kind)),durationMs:Math.min(86400000,Math.max(0,Math.round(durationMs))),inactiveMs:Math.min(86400000,Math.max(0,Math.round(inactiveMs))),submittedAt:new Date().toISOString()}
  if(kind==='review'&&reviewQuestion)next.reviewAttempts.push(attempt)
  else if(kind==='reviewRetry'&&reviewQuestion)next.reviewRetries.push(attempt)
  else if(kind==='review')next.reviews.push(attempt)
  else if(kind==='retry')next.retries.push(attempt)
  else next.attempts.push(attempt)
  if((kind==='first'||kind==='retry')&&next.retryPolicyVersion===1&&next.attempts.length===next.questions.length&&next.questions.every(item=>resolved(next,item.id))){next.status='completed';next.completedAt=attempt.submittedAt;next.reviewQuestions=buildReviewQuestions(next,rng)}
  return next
}
export function summary(s:Session){const correct=s.attempts.filter(a=>a.correct).length,duration=[...s.attempts,...s.retries].reduce((a,b)=>a+b.durationMs,0);return {correct,wrong:s.attempts.length-correct,rate:s.attempts.length?Math.round(correct/s.attempts.length*100):0,duration,average:s.attempts.length?duration/s.attempts.length:0}}
export function reviewed(s:Session,id:string):boolean {const review=s.reviewQuestions.find(x=>x.sourceQuestionId===id);return review?reviewResolved(s,review.question.id):s.reviews.some(a=>a.questionId===id&&a.correct)}
export function growth(s:Session,all:AppState['sessions']):string {
  const key=(v:Session)=>JSON.stringify(v.questions.map(q=>`${q.operator}/${q.digitsA}/${q.digitsB}/${q.difficulty}/${q.carryBorrowType}`).sort())
  if(s.status!=='completed'||s.attempts.length<10)return '오늘 푼 문제를 확인하고, 헷갈린 계산은 한 번 더 살펴보세요.'
  const previous=all.filter(x=>x.id!==s.id&&x.status==='completed'&&x.startedAt<s.startedAt&&x.attempts.length>=10&&key(x)===key(s)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]
  if(previous){const rateDelta=summary(s).rate-summary(previous).rate,currentTime=formatDuration(summary(s).duration),previousTime=formatDuration(summary(previous).duration),rate=rateDelta>0?`첫 답 정답률이 ${rateDelta}%p 높고`:rateDelta<0?`첫 답 정답률이 ${Math.abs(rateDelta)}%p 낮고`:'첫 답 정답률은 같고';return `같은 조건의 지난 학습보다 ${rate}, 풀이 시간은 ${currentTime}예요(지난번 ${previousTime}, 참고).`}
  return '오늘 푼 문제를 확인하고, 헷갈린 계산은 한 번 더 살펴보세요.'
}
export function formatDuration(ms:number){const seconds=Math.round(ms/1000);return seconds<60?`${seconds}초`:`${Math.floor(seconds/60)}분 ${seconds%60}초`}
