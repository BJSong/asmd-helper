import { type AppState, type Session, type Settings, type Plan, type Answer, emptyState, seoulDate, stateSchema } from '#shared/model'
import { dailySession, freeSession, submit, type SubmissionKind, scheduleReviews, queueWrongAnswer, submitSpacedReview } from '#domain/learning'
import { FamilySignInRequiredError, IndexedDbLearningRepository, ServerApiLearningRepository, type LearningRepository } from '#repositories/learning'
import { CloudDraftRepository, cloudCommit, type CloudDraft } from '#repositories/cloud-draft'

let repository:LearningRepository|undefined
let loading:Promise<void>|undefined
let activeDraft:CloudDraft|undefined
let syncing:Promise<boolean>|undefined
const draftStore=new CloudDraftRepository()

export function useLearning(){
  const state=useState<AppState>('learning',emptyState)
  const ready=useState('ready',()=>false),error=useState('storage-error',()=>''),busy=useState('storage-busy',()=>false)
  const mode=useState<'loading'|'local'|'cloud'>('storage-mode',()=> 'loading'),signInRequired=useState('family-sign-in-required',()=>false)
  const syncStatus=useState<'synced'|'local'|'syncing'|'failed'>('cloud-sync-status',()=> 'synced')
  const syncError=useState('cloud-sync-error',()=> '')

  async function init(){
    if(ready.value)return
    if(loading)return loading
    loading=(async()=>{
      try{
        const response=await fetch('/api/storage-mode')
        if(!response.ok)throw new Error(response.status===503?'클라우드 설정이 완료되지 않았어요. 가족 암호는 8자 이상이어야 하며 서버 환경변수를 확인해 주세요.':'저장소 설정을 확인할 수 없어요. 서버 환경변수를 확인해 주세요.')
        const selection=await response.json() as {mode?:string}
        if(selection.mode!=='local'&&selection.mode!=='cloud')throw new Error('올바른 저장소 설정을 받지 못했어요.')
        repository=selection.mode==='cloud'?new ServerApiLearningRepository():new IndexedDbLearningRepository()
        mode.value=selection.mode
        if(selection.mode==='cloud'){
          activeDraft=await draftStore.load()
          state.value=activeDraft?.state??await repository.load()
          syncStatus.value=activeDraft?'local':'synced'
        }else{
          activeDraft=undefined
          state.value=await repository.load()
          syncStatus.value='synced'
        }
        signInRequired.value=false
        error.value=''
        ready.value=true
        if(activeDraft?.shouldSync)void flushDraft()
      }catch(e){
        if(e instanceof FamilySignInRequiredError){signInRequired.value=true;error.value='';return}
        error.value=e instanceof Error?e.message:'저장소를 열지 못했어요.'
        throw e
      }finally{loading=undefined}
    })()
    return loading
  }

  async function signIn(password:string){
    const response=await fetch('/api/family-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})})
    if(!response.ok)throw new Error(response.status===401?'공용 암호가 맞지 않아요.':response.status===503?'클라우드 설정이 완료되지 않았어요. 가족 암호는 8자 이상이어야 하며 서버 환경변수를 확인해 주세요.':'로그인하지 못했어요. 서버 설정을 확인해 주세요.')
    signInRequired.value=false
    await init()
    if(!ready.value)throw new Error('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.')
  }

  async function flushDraft():Promise<boolean>{
    if(mode.value!=='cloud'||!activeDraft)return true
    if(syncing)return syncing
    syncing=(async()=>{
      const draft={...activeDraft!,shouldSync:true}
      try{
        await draftStore.save(draft)
        activeDraft=draft
        syncStatus.value='syncing'
        syncError.value=''
        const response=await fetch('/api/cloud/commit-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cloudCommit(draft))})
        if(!response.ok){
          if(response.status===401)throw new FamilySignInRequiredError()
          if(response.status===409)throw new Error('다른 기기에서 같은 학습 기록이 변경됐어요. 이 기기의 답안은 보관되어 있습니다.')
          throw new Error('서버 저장에 실패했어요. 답안은 이 기기에 보관되어 있습니다.')
        }
        const saved=stateSchema.parse(await response.json())
        await draftStore.clear()
        activeDraft=undefined
        state.value=saved
        syncStatus.value='synced'
        syncError.value=''
        return true
      }catch(e){
        syncStatus.value='failed'
        syncError.value=e instanceof Error?e.message:'서버 저장에 실패했어요.'
        if(e instanceof FamilySignInRequiredError){ready.value=false;signInRequired.value=true}
        return false
      }finally{syncing=undefined}
    })()
    return syncing
  }

  async function signOut(){
    if(activeDraft&&!await flushDraft())throw new Error(syncError.value)
    const response=await fetch('/api/family-logout',{method:'POST'})
    if(!response.ok)throw new Error('로그아웃하지 못했어요.')
    ready.value=false;signInRequired.value=true;state.value=emptyState();error.value=''
  }

  async function mutate(fn:(current:AppState)=>void){
    if(busy.value)throw new Error('저장 중이에요. 잠시 기다려 주세요.')
    busy.value=true;error.value=''
    try{
      await init()
      if(!ready.value)throw new FamilySignInRequiredError()
      if(activeDraft&&!await flushDraft())throw new Error(syncError.value)
      const current=await repository!.load()
      fn(current)
      state.value=await repository!.save(current,current.revision)
    }catch(e){
      if(e instanceof FamilySignInRequiredError){ready.value=false;signInRequired.value=true;state.value=emptyState()}
      error.value=e instanceof FamilySignInRequiredError?'':e instanceof Error?e.message:'저장하지 못했어요.'
      throw e
    }finally{busy.value=false}
  }

  async function mutateDraft(id:string,fn:(current:AppState)=>void){
    if(busy.value)throw new Error('저장 중이에요. 잠시 기다려 주세요.')
    busy.value=true;error.value=''
    try{
      await init()
      if(!ready.value)throw new FamilySignInRequiredError()
      if(activeDraft&&activeDraft.sessionId!==id&&!await flushDraft())throw new Error(syncError.value)
      if(!activeDraft){
        const baseline=structuredClone(toRaw(state.value))
        const baseSession=baseline.sessions.find((item:Session)=>item.id===id)
        if(!baseSession)throw new Error('학습 기록을 찾을 수 없어요.')
        activeDraft={sessionId:id,commitId:crypto.randomUUID(),baseSession,baseReviews:baseline.reviewQueue,state:baseline,shouldSync:false}
      }
      const next=structuredClone(activeDraft.state)
      fn(next)
      const updated={...activeDraft,state:next}
      await draftStore.save(updated)
      activeDraft=updated
      state.value=next
      syncStatus.value='local'
    }catch(e){
      error.value=e instanceof Error?e.message:'이 기기에 저장하지 못했어요.'
      throw e
    }finally{busy.value=false}
  }

  async function startDaily(){let id='';await mutate(current=>{const today=seoulDate(),existing=current.sessions.find(s=>s.id===`daily-${today}`);if(existing){id=existing.id;return}const s=dailySession(current.plan,today);scheduleReviews(current,s);current.sessions.push(s);id=s.id;current.onboarded=true});return id}
  async function startFree(settings:Settings,mixedRecognition=false,lastSettings:Settings=settings){let id='';await mutate(current=>{const s=freeSession(settings,mixedRecognition);scheduleReviews(current,s);current.sessions.push(s);current.lastSettings=structuredClone(lastSettings);id=s.id});return id}
  async function savePlan(plan:Plan){await mutate(current=>{current.plan=structuredClone(plan);current.onboarded=true})}
  async function setReviewQuestionLimit(limit:number){if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('복습 상한은 1~10문제여야 해요.');await mutate(current=>{current.reviewQuestionLimit=limit})}

  async function answer(id:string,qid:string,value:Answer,duration:number,inactive:number,kind:SubmissionKind='first'){
    const apply=(current:AppState)=>{const i=current.sessions.findIndex(s=>s.id===id);if(i<0)throw new Error('학습 기록을 찾을 수 없어요.');const before=current.sessions[i]!,after=submit(before,qid,value,duration,inactive,kind);current.sessions[i]=after;if(kind==='first'){const attempt=after.attempts.find(a=>a.questionId===qid)!;queueWrongAnswer(current,after,after.questions.find(q=>q.id===qid)!,attempt)}}
    if(mode.value==='cloud'){
      const wasCompleted=state.value.sessions.find(s=>s.id===id)?.status==='completed'
      await mutateDraft(id,apply)
      if(!wasCompleted&&state.value.sessions.find(s=>s.id===id)?.status==='completed')void flushDraft()
    }else await mutate(apply)
  }
  async function spacedAnswer(sessionId:string,itemId:string,value:Answer,duration:number){const apply=(current:AppState)=>{submitSpacedReview(current,sessionId,itemId,value,duration)};if(mode.value==='cloud')await mutateDraft(sessionId,apply);else await mutate(apply)}
  async function setSpacedReviewPosition(id:string,position:number){const apply=(current:AppState)=>{const s=current.sessions.find(x=>x.id===id);if(!s)throw new Error('학습 기록을 찾을 수 없어요.');s.spacedReviewPosition=position};if(mode.value==='cloud')await mutateDraft(id,apply);else await mutate(apply)}
  async function restore(data:AppState){await mutate(current=>{const revision=current.revision;Object.assign(current,structuredClone(toRaw(data)),{revision})})}
  async function clear(){await mutate(current=>{const revision=current.revision;Object.assign(current,emptyState(),{revision})})}
  return {state,ready,busy,error,mode,signInRequired,syncStatus,syncError,init,signIn,signOut,flushDraft,startDaily,startFree,savePlan,setReviewQuestionLimit,answer,spacedAnswer,setSpacedReviewPosition,restore,clear,session:(id:string):Session|undefined=>state.value.sessions.find(s=>s.id===id)}
}
