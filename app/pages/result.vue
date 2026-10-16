<script setup lang="ts">
import {operatorNames,symbols,type Operator} from '#shared/model'
import {summary,reviewed,growth,formatDuration,reviewResolved,retryCount} from '#domain/learning'
const route=useRoute(),{session,state}=useLearning(),current=computed(()=>session(String(route.query.id??''))),stats=computed(()=>current.value?summary(current.value):null)
const wrong=computed(()=>current.value?.attempts.filter(a=>!a.correct)??[]),reviewItems=computed(()=>current.value?.reviewQuestions??[]),remaining=computed(()=>current.value?.retryPolicyVersion===1?reviewItems.value.filter(x=>!reviewResolved(current.value!,x.question.id)).length:wrong.value.filter(a=>!reviewed(current.value!,a.questionId)).length)
const spacedRemaining=computed(()=>current.value?.scheduledReviewIds.filter(id=>state.value.reviewQueue.some(x=>x.id===id&&x.assignedSessionId===current.value?.id)).length??0)
const operatorStats=computed(()=>{
 const s=current.value;if(!s)return []
 return [...new Set(s.questions.map(q=>q.operator))].map((operator:Operator)=>{
  const questions=s.questions.filter(q=>q.operator===operator),correct=questions.filter(q=>s.attempts.find(a=>a.questionId===q.id)?.correct).length
  return {operator,correct,total:questions.length,percent:questions.length?Math.round(correct/questions.length*100):0}
 })
})
function question(id:string){return current.value?.questions.find(q=>q.id===id)}
function retryStatus(id:string){const s=current.value;if(!s)return '복습 전';if(s.retryPolicyVersion===1&&s.retries.some(r=>r.questionId===id&&r.correct))return '다시 도전해 맞혔어요';if(reviewed(s,id))return '✓ 복습 완료';return s.retryPolicyVersion===1?'유사 복습 대기':'복습 전'}
function disclosedAnswer(id:string){const s=current.value,q=question(id);if(!s||!q||retryCount(s,id)<2||s.retries.some(r=>r.questionId===id&&r.correct))return '';return ` · 정답 ${q.answer}${q.operator==='divide'&&q.remainder?` (나머지 ${q.remainder})`:''}`}
</script>
<template>
 <div v-if="current&&stats" class="page result-page">
  <div class="result-heading"><span class="complete-mark"><AppIcon name="check" :size="28"/></span><div class="eyebrow">{{current.date}} · {{current.type==='daily'?'매일 학습':'자유 학습'}}</div><h1>{{current.status==='completed'?'오늘의 연습을 마쳤어요.':'여기까지 학습했어요.'}}</h1><p>{{growth(current,state.sessions)}}</p></div>
  <div class="result-stats"><div><span>정답률</span><b>{{stats.rate}}<small>%</small></b></div><div><span>맞힌 문제</span><b>{{stats.correct}}<small>/ {{current.questions.length}}</small></b></div><div><span>다시 볼 문제</span><b>{{stats.wrong}}<small>문제</small></b></div><div><span>풀이 시간</span><b class="duration-value">{{formatDuration(stats.duration)}}</b><small>평균 {{formatDuration(stats.average)}}</small></div></div>
  <section class="result-section"><h2>연산별 학습 결과</h2><div v-for="item in operatorStats" :key="item.operator" class="operator-result"><span>{{operatorNames[item.operator]}}</span><div class="progress-track"><span :style="{width:item.percent+'%'}"/></div><b>{{item.correct}} / {{item.total}}</b></div></section>
  <section class="result-section"><div class="section-heading"><h2>다시 확인할 문제 <span class="muted">{{wrong.length}}</span></h2><NuxtLink v-if="remaining" :to="`/learn?id=${current.id}&review=1`" class="btn small secondary">{{current.retryPolicyVersion===1?'유사 문제':'오답'}} {{remaining}}문제 복습<AppIcon name="refresh" :size="16"/></NuxtLink><NuxtLink v-if="spacedRemaining" :to="`/learn?id=${current.id}&review=spaced`" class="btn small secondary">간격 복습 {{spacedRemaining}}문제<AppIcon name="refresh" :size="16"/></NuxtLink></div><p v-if="!wrong.length" class="muted">첫 시도에 모두 맞혔어요.</p><div v-for="a in wrong" :key="a.questionId" class="wrong-row"><b>{{question(a.questionId)?.operandA}} {{symbols[question(a.questionId)!.operator]}} {{question(a.questionId)?.operandB}}</b><span>내 첫 답 {{a.answer.value}}{{a.answer.remainder?` (나머지 ${a.answer.remainder})`:''}}{{disclosedAnswer(a.questionId)}}</span><span>{{retryStatus(a.questionId)}}</span></div><p v-if="wrong.length" class="footnote muted">정답률은 첫 답안 기준이에요. 다시 도전한 결과와 복습 결과는 따로 저장돼요.</p></section>
  <div class="result-actions"><NuxtLink to="/history" class="btn secondary">학습 기록 보기</NuxtLink><NuxtLink :to="current.status==='completed'?'/':`/learn?id=${current.id}`" class="btn">{{current.status==='completed'?'홈으로 돌아가기':'이어서 학습'}}<AppIcon name="arrow" :size="18"/></NuxtLink></div>
 </div><div v-else class="page"><h1>학습 기록을 찾을 수 없어요.</h1><NuxtLink to="/">홈으로</NuxtLink></div>
</template>
