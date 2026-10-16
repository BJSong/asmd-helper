import { z } from 'zod'
import { complexity } from './arithmetic-rules'
export const operatorSchema = z.enum(['add', 'subtract', 'multiply', 'divide'])
export type Operator = z.infer<typeof operatorSchema>
export const operatorNames: Record<Operator, string> = { add: '덧셈', subtract: '뺄셈', multiply: '곱셈', divide: '나눗셈' }
export const symbols: Record<Operator, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' }
export const settingsSchema = z.object({
  operators: z.array(operatorSchema).min(1).max(4).refine(v => new Set(v).size === v.length),
  digitsA: z.number().int().min(1).max(4), digitsB: z.number().int().min(1).max(4),
  difficulty: z.enum(['easy', 'normal', 'hard']), carry: z.enum(['any', 'none', 'required']),
  count: z.number().int().min(1).max(100), allowNegative: z.boolean(), allowRemainder: z.boolean(), showTime: z.boolean(),
})
export type Settings = z.infer<typeof settingsSchema>
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v)
export const planSchema = z.object({
  startDate: dateSchema, weekdays: z.array(z.number().int().min(0).max(6)).max(7).refine(v => new Set(v).size === v.length),
  settings: settingsSchema, foundation: settingsSchema.optional(),
  ratios: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100), z.number().min(0).max(100)]).refine(v => v.reduce((a,b) => a+b,0) === 100, '비율의 합계는 100이어야 해요.').optional(),
  weekdaySettings: z.record(z.string().regex(/^[0-6]$/), settingsSchema), updatedAt: z.string().datetime(),
})
export type Plan = z.infer<typeof planSchema>
export const questionSchema = z.object({
  id: z.string().min(1).max(100), operator: operatorSchema,
  operandA: z.number().int().min(1).max(9999), operandB: z.number().int().min(1).max(9999),
  answer: z.number().int(), quotient: z.number().int().optional(), remainder: z.number().int().nonnegative().optional(),
  difficulty: settingsSchema.shape.difficulty, digitsA: settingsSchema.shape.digitsA, digitsB: settingsSchema.shape.digitsB,
  carryBorrowType: z.enum(['none', 'required', 'not-applicable']), generationVersion: z.literal(1), stage: z.enum(['foundation','focus','mixed']).optional(),
}).superRefine((q,ctx) => {
  const expected = q.operator === 'add' ? q.operandA+q.operandB : q.operator === 'subtract' ? q.operandA-q.operandB : q.operator === 'multiply' ? q.operandA*q.operandB : Math.floor(q.operandA/q.operandB)
  const rules=complexity(q.operator,q.operandA,q.operandB), commutative=q.operator==='add'||q.operator==='multiply', first=commutative?Math.min(q.operandA,q.operandB):q.operandA, second=commutative?Math.max(q.operandA,q.operandB):q.operandB
  const expectedId=`${q.operator}:${first}:${second}`, expectedCarry=q.operator==='divide'?'not-applicable':rules.carry>0?'required':'none'
  if (q.answer !== expected || String(q.operandA).length !== q.digitsA || String(q.operandB).length !== q.digitsB || q.difficulty!==rules.difficulty || q.carryBorrowType!==expectedCarry || q.id!==expectedId || (q.operator === 'divide' && (q.quotient !== expected || q.remainder !== q.operandA % q.operandB || expected < 1))) ctx.addIssue({code:'custom',message:'문제 데이터가 올바르지 않아요.'})
})
export type Question = z.infer<typeof questionSchema>
export const answerSchema = z.object({ value: z.number().int().min(-99999999).max(99999999), remainder: z.number().int().min(0).max(9999).optional(), operator:operatorSchema.optional() })
export type Answer = z.infer<typeof answerSchema>
export const attemptSchema = z.object({ questionId: z.string(), answer: answerSchema, correct: z.boolean(), durationMs: z.number().int().min(0).max(86400000), inactiveMs: z.number().int().min(0).max(86400000), submittedAt: z.string().datetime() })
export type Attempt = z.infer<typeof attemptSchema>
export const hintLogSchema = z.object({questionId:z.string(),stage:z.number().int().min(1).max(2),viewedAt:z.string().datetime()})
export const reviewQueueItemSchema = z.object({ id:z.string(), sourceSessionId:z.string(), sourceQuestionId:z.string(), question:questionSchema, firstWrongAt:z.string().datetime(), dueSession:z.number().int().positive(), interval:z.number().int().positive(), status:z.enum(['due','scheduled','mastered']), assignedSessionId:z.string().optional(), attempts:z.array(attemptSchema).max(100).default([]), hintViews:z.array(hintLogSchema).max(200).default([]), lastAttemptSession:z.number().int().nonnegative().default(0), attemptsThisSession:z.number().int().min(0).max(3).default(0), createdAt:z.string().datetime() })
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>
export const sessionSchema = z.object({
  id: z.string().min(1).max(100), type: z.enum(['daily','free']), date: dateSchema,
  settings: settingsSchema, planSnapshot: planSchema.optional(), questions: z.array(questionSchema).min(1).max(100),
  attempts: z.array(attemptSchema).max(100), retries: z.array(attemptSchema).max(200).default([]), reviews: z.array(attemptSchema).max(10000),
  retryPolicyVersion: z.literal(1).optional(), reviewQuestions: z.array(z.object({sourceQuestionId:z.string(),question:questionSchema})).max(100).default([]), reviewAttempts: z.array(attemptSchema).max(100).default([]), reviewRetries:z.array(attemptSchema).max(200).default([]),
  mixedRecognition:z.boolean().default(false),
  hintViews:z.array(hintLogSchema).max(400).default([]),
  scheduledReviewIds:z.array(z.string()).max(10).default([]),
  spacedReviewPosition:z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime(), completedAt: z.string().datetime().optional(), status: z.enum(['in-progress','completed']),
}).superRefine((s,ctx) => {
  const ids = new Set(s.questions.map(q=>q.id))
  const retryCounts=new Map<string,number>();for(const retry of s.retries)retryCounts.set(retry.questionId,(retryCounts.get(retry.questionId)??0)+1)
  const newResolved=s.questions.every(q=>{const first=s.attempts.find(a=>a.questionId===q.id);return !!first&&(first.correct||s.retries.some(a=>a.questionId===q.id&&a.correct)||(retryCounts.get(q.id)??0)>=2)})
  const completionMatches=s.retryPolicyVersion===1?(s.status==='completed')===(s.attempts.length===s.questions.length&&newResolved):(s.status==='completed')===(s.attempts.length===s.questions.length)
  const retryInvalid=s.retryPolicyVersion===1&&s.retries.some(a=>!s.attempts.some(f=>f.questionId===a.questionId&&!f.correct))||[...retryCounts.values()].some(n=>n>2)
  const reviewRetryCounts=new Map<string,number>();for(const retry of s.reviewRetries)reviewRetryCounts.set(retry.questionId,(reviewRetryCounts.get(retry.questionId)??0)+1)
  const reviewQuestionIds=new Set(s.reviewQuestions.map(x=>x.question.id))
  const invalid = ids.size !== s.questions.length || s.questions.length !== s.settings.count || s.attempts.some((a,i)=>a.questionId!==s.questions[i]?.id) || s.reviews.some(a=>!s.attempts.some(f=>f.questionId===a.questionId&&!f.correct)) || s.reviewQuestions.some(x=>!ids.has(x.sourceQuestionId)) || reviewQuestionIds.size!==s.reviewQuestions.length || s.reviewAttempts.some(a=>!reviewQuestionIds.has(a.questionId)) || s.reviewRetries.some(a=>!reviewQuestionIds.has(a.questionId)||!s.reviewAttempts.some(f=>f.questionId===a.questionId&&!f.correct)) || [...reviewRetryCounts.values()].some(n=>n>2) || retryInvalid || !completionMatches || (s.status==='completed') !== Boolean(s.completedAt) || (s.type==='daily' && (s.id!==`daily-${s.date}` || !s.planSnapshot))
  if (invalid) ctx.addIssue({code:'custom',message:'학습 기록의 연결 또는 완료 상태가 올바르지 않아요.'})
  for (const a of [...s.attempts,...s.retries,...s.reviews]) { const q=s.questions.find(q=>q.id===a.questionId); if (!q || a.correct !== (a.answer.value===q.answer && (q.operator!=='divide' || (a.answer.remainder??0)===q.remainder) && (!s.mixedRecognition||s.reviews.includes(a)||a.answer.operator===q.operator))) ctx.addIssue({code:'custom',message:'채점 결과가 일치하지 않아요.'}) }
  for (const a of [...s.reviewAttempts,...s.reviewRetries]) { const q=s.reviewQuestions.find(x=>x.question.id===a.questionId)?.question; if (!q || a.correct !== (a.answer.value===q.answer && (q.operator!=='divide' || (a.answer.remainder??0)===q.remainder))) ctx.addIssue({code:'custom',message:'복습 채점 결과가 일치하지 않아요.'}) }
})
export type Session = z.infer<typeof sessionSchema>
export const stateSchema = z.object({ schemaVersion: z.literal(2), revision: z.number().int().nonnegative(), onboarded: z.boolean(), plan: planSchema, lastSettings: settingsSchema, sessions: z.array(sessionSchema).max(10000), sessionCounter:z.number().int().nonnegative().default(0), reviewQueue:z.array(reviewQueueItemSchema).max(500).default([]), reviewQuestionLimit:z.number().int().min(1).max(10).default(5) }).superRefine((s,ctx)=>{
  if(new Set(s.sessions.map(x=>x.id)).size!==s.sessions.length||new Set(s.reviewQueue.map(x=>x.id)).size!==s.reviewQueue.length)ctx.addIssue({code:'custom',message:'중복 학습 기록이 있어요.'})
  for(const session of s.sessions){if(new Set(session.scheduledReviewIds).size!==session.scheduledReviewIds.length||session.scheduledReviewIds.some(id=>!s.reviewQueue.some(q=>q.id===id))||session.spacedReviewPosition>session.scheduledReviewIds.length)ctx.addIssue({code:'custom',message:'복습 순서가 올바르지 않아요.'})}
  for(const item of s.reviewQueue){const source=s.sessions.find(x=>x.id===item.sourceSessionId),sourceQuestion=source?.questions.find(q=>q.id===item.sourceQuestionId);if(!sourceQuestion||sourceQuestion.id!==item.question.id)ctx.addIssue({code:'custom',message:'복습 원본 문제를 찾을 수 없어요.'});if(item.assignedSessionId&&!s.sessions.find(x=>x.id===item.assignedSessionId)?.scheduledReviewIds.includes(item.id))ctx.addIssue({code:'custom',message:'복습 배정이 일치하지 않아요.'});for(const attempt of item.attempts){const correct=attempt.answer.value===item.question.answer&&(item.question.operator!=='divide'||(attempt.answer.remainder??0)===item.question.remainder);if(attempt.questionId!==item.question.id||attempt.correct!==correct)ctx.addIssue({code:'custom',message:'복습 채점 결과가 일치하지 않아요.'})}if(item.hintViews.some(h=>h.questionId!==item.question.id))ctx.addIssue({code:'custom',message:'힌트 기록이 올바르지 않아요.'})}
})
export type AppState = z.infer<typeof stateSchema>
export const presets: Record<string, Settings> = {
  basic: { operators:['add','subtract'], digitsA:1, digitsB:1, difficulty:'easy', carry:'any', count:20, allowNegative:false, allowRemainder:false, showTime:false },
  normal: { operators:['add','subtract'], digitsA:2, digitsB:2, difficulty:'normal', carry:'any', count:20, allowNegative:false, allowRemainder:false, showTime:false },
  advanced: { operators:['add','subtract','multiply','divide'], digitsA:3, digitsB:2, difficulty:'normal', carry:'any', count:20, allowNegative:false, allowRemainder:false, showTime:false },
}
export function seoulDate(now = new Date()): string { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now) }
export function emptyState(): AppState { const settings = structuredClone(presets.normal!); return {schemaVersion:2,revision:0,onboarded:false,plan:{startDate:seoulDate(),weekdays:[0,1,2,3,4,5,6],settings,weekdaySettings:{},updatedAt:new Date().toISOString()},lastSettings:structuredClone(settings),sessions:[],sessionCounter:0,reviewQueue:[],reviewQuestionLimit:5} }
