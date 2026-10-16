import { type AppState, type Session, type Settings, type Plan, type Answer, emptyState, seoulDate } from '#shared/model'
import { dailySession, freeSession, submit, type SubmissionKind, scheduleReviews, queueWrongAnswer, submitSpacedReview } from '#domain/learning'
import { IndexedDbLearningRepository, ServerApiLearningRepository, type LearningRepository } from '#repositories/learning'
let repository:LearningRepository|undefined
let loading:Promise<void>|undefined
export function useLearning(){
  const state=useState<AppState>('learning',emptyState),ready=useState('ready',()=>false),error=useState('storage-error',()=>''),busy=useState('storage-busy',()=>false),mode=useState<'local'|'cloud'>('storage-mode',()=> 'local')
  async function init(){if(ready.value)return;if(loading)return loading;loading=(async()=>{try{repository??=new IndexedDbLearningRepository();state.value=await repository.load();ready.value=true}catch(e){error.value='저장소를 열지 못했어요. 브라우저의 저장 공간과 개인정보 설정을 확인해 주세요.';throw e}finally{loading=undefined}})();return loading}
  async function mutate(fn:(current:AppState)=>void){if(busy.value)throw new Error('저장 중이에요. 잠시 기다려 주세요.');busy.value=true;error.value='';try{await init();const current=await repository!.load();fn(current);state.value=await repository!.save(current,current.revision)}catch(e){error.value=e instanceof Error?e.message:'저장하지 못했어요.';throw e}finally{busy.value=false}}
  async function startDaily(){let id='';await mutate(current=>{const today=seoulDate();const existing=current.sessions.find(s=>s.id===`daily-${today}`);if(existing){id=existing.id;return}const s=dailySession(current.plan,today);scheduleReviews(current,s);current.sessions.push(s);id=s.id;current.onboarded=true});return id}
  async function startFree(settings:Settings,mixedRecognition=false,lastSettings:Settings=settings){let id='';await mutate(current=>{const s=freeSession(settings,mixedRecognition);scheduleReviews(current,s);current.sessions.push(s);current.lastSettings=structuredClone(lastSettings);id=s.id});return id}
  async function savePlan(plan:Plan){await mutate(current=>{current.plan=structuredClone(plan);current.onboarded=true})}
  async function setReviewQuestionLimit(limit:number){if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('복습 상한은 1~10문제여야 해요.');await mutate(current=>{current.reviewQuestionLimit=limit})}
  async function answer(id:string,qid:string,value:Answer,duration:number,inactive:number,kind:SubmissionKind='first'){await mutate(current=>{const i=current.sessions.findIndex(s=>s.id===id);if(i<0)throw new Error('학습 기록을 찾을 수 없어요.');const before=current.sessions[i]!,after=submit(before,qid,value,duration,inactive,kind);current.sessions[i]=after;if(kind==='first'){const attempt=after.attempts.find(a=>a.questionId===qid)!;queueWrongAnswer(current,after,after.questions.find(q=>q.id===qid)!,attempt)}})}
  async function spacedAnswer(sessionId:string,itemId:string,value:Answer,duration:number){await mutate(current=>{submitSpacedReview(current,sessionId,itemId,value,duration)})}
  async function setSpacedReviewPosition(id:string,position:number){await mutate(current=>{const s=current.sessions.find(x=>x.id===id);if(!s)throw new Error('학습 기록을 찾을 수 없어요.');s.spacedReviewPosition=position})}
  async function changeMode(next:'local'|'cloud',token=''){if(busy.value)return;busy.value=true;try{const candidate=next==='local'?new IndexedDbLearningRepository():new ServerApiLearningRepository(token);const loaded=await candidate.load();repository=candidate;state.value=loaded;mode.value=next;ready.value=true;error.value=''}finally{busy.value=false}}
  async function restore(data:AppState){await mutate(current=>{const revision=current.revision;Object.assign(current,structuredClone(data),{revision})})}
  async function clear(){await mutate(current=>{const revision=current.revision;Object.assign(current,emptyState(),{revision})})}
  return {state,ready,busy,error,mode,init,startDaily,startFree,savePlan,setReviewQuestionLimit,answer,spacedAnswer,setSpacedReviewPosition,changeMode,restore,clear,session:(id:string):Session|undefined=>state.value.sessions.find(s=>s.id===id)}
}
