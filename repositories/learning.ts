import { openDB, type IDBPDatabase } from 'idb'
import { emptyState, stateSchema, type AppState } from '#shared/model'
export interface LearningRepository { load():Promise<AppState>; save(state:AppState,expectedRevision:number):Promise<AppState>; clear(expectedRevision:number):Promise<AppState> }
export class ConflictError extends Error { constructor(){super('다른 탭에서 기록이 바뀌었어요. 화면을 다시 열어 주세요.')} }
export function migrateState(input:unknown):AppState {
  if(!input||typeof input!=='object'||!('schemaVersion' in input))throw new Error('지원하지 않거나 손상된 학습 데이터예요.')
  const raw=input as Record<string,unknown>
  if(raw.schemaVersion===1){const sessions=Array.isArray(raw.sessions)?raw.sessions:[];return stateSchema.parse({...raw,schemaVersion:2,sessionCounter:sessions.length,reviewQueue:[],reviewQuestionLimit:5})}
  return stateSchema.parse(raw)
}
export class IndexedDbLearningRepository implements LearningRepository {
  private database?:Promise<IDBPDatabase>
  constructor(private name='afsr-math-v1'){}
  private db(){return this.database??=openDB(this.name,1,{upgrade(db){db.createObjectStore('state')}})}
  async load(){const db=await this.db();const value=await db.get('state','main');if(!value)return emptyState();const migrated=migrateState(value);if((value as {schemaVersion?:number}).schemaVersion!==2){const tx=db.transaction('state','readwrite');await tx.store.put(migrated,'main');await tx.done}return migrated}
  async save(state:AppState,expectedRevision:number){
    const validated=stateSchema.parse({...state,revision:expectedRevision+1}),db=await this.db(),tx=db.transaction('state','readwrite')
    const old=await tx.store.get('main') as AppState|undefined
    if((old?.revision??0)!==expectedRevision){tx.abort();await tx.done.catch(()=>{});throw new ConflictError()}
    await tx.store.put(validated,'main');await tx.done;return validated
  }
  async clear(revision:number){return this.save(emptyState(),revision)}
}
export class ServerApiLearningRepository implements LearningRepository {
  constructor(private token:string){}
  private async request(method:string,body?:unknown):Promise<AppState>{
    const response=await fetch('/api/cloud/state',{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token}`},...(body?{body:JSON.stringify(body)}:{})})
    if(!response.ok){if(response.status===409)throw new ConflictError();throw new Error(response.status===401?'접근 키를 확인해 주세요.':response.status===503?'클라우드 연결이 준비되지 않았어요. 서버 설정을 확인해 주세요.':'클라우드 저장에 실패했어요. 연결을 확인한 뒤 다시 시도해 주세요.')}
    return stateSchema.parse(await response.json())
  }
  load(){return this.request('GET')}
  save(state:AppState,expectedRevision:number){return this.request('PUT',{state,expectedRevision})}
  clear(expectedRevision:number){return this.request('DELETE',{expectedRevision})}
}
export const MAX_BACKUP_BYTES=10*1024*1024
export function parseBackup(text:string):AppState {if(new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw new Error('백업은 10MB 이하만 가져올 수 있어요.');let input:unknown;try{input=JSON.parse(text)}catch{throw new Error('올바른 JSON 백업 파일을 선택해 주세요.')}try{return migrateState(input)}catch{throw new Error('지원하지 않거나 손상된 백업 파일이에요.') }}
