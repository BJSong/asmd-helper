<script setup lang="ts">
import {seoulDate,presets,operatorNames,type Settings} from '#shared/model'
import {scheduled,summary,weekday,nextPosition} from '#domain/learning'
const {state,startDaily,savePlan,busy}=useLearning()
const message=ref(''),today=seoulDate()
const daily=computed(()=>state.value.sessions.find(s=>s.id===`daily-${today}`))
const spacedDue=computed(()=>daily.value?.scheduledReviewIds.map(id=>state.value.reviewQueue.find(x=>x.id===id)).filter(x=>x?.assignedSessionId===daily.value?.id)??[])
const remainingToday=computed(()=>daily.value?(daily.value.retryPolicyVersion===1?daily.value.questions.length-nextPosition(daily.value):daily.value.questions.length-daily.value.attempts.length):state.value.plan.settings.count)
const unfinished=computed(()=>state.value.sessions.filter(s=>s.status==='in-progress'&&s.id!==daily.value?.id))
const todaySettings=computed(()=>state.value.plan.weekdaySettings[String(weekday(today))]??state.value.plan.settings)
const operationLabels=computed(()=>todaySettings.value.operators.map(op=>operatorNames[op]).join(' · '))
const digitABoxes=computed(()=> '□'.repeat(todaySettings.value.digitsA))
const digitBBoxes=computed(()=> '□'.repeat(todaySettings.value.digitsB))
const selected=ref('normal')
const week=computed(()=>{const d=new Date(`${today}T12:00:00+09:00`);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>{const n=new Date(d);n.setUTCDate(n.getUTCDate()+i);const date=seoulDate(n);return {date,day:['월','화','수','목','금','토','일'][i],number:Number(date.slice(-2)),done:state.value.sessions.some(s=>s.date===date&&s.status==='completed'),active:date===today}})})
const completed=computed(()=>state.value.sessions.filter(s=>s.status==='completed'))
const weekCompleted=computed(()=>completed.value.filter(s=>s.date>=week.value[0]!.date&&s.date<=week.value[6]!.date))
const answered=computed(()=>weekCompleted.value.reduce((a,s)=>a+s.attempts.length,0))
const accuracy=computed(()=>answered.value?Math.round(weekCompleted.value.reduce((a,s)=>a+summary(s).correct,0)/answered.value*100):null)
async function begin(){message.value='';try{const id=await startDaily();await navigateTo(`/learn?id=${id}`)}catch(e){message.value=(e as Error).message}}
async function setup(){const plan=JSON.parse(JSON.stringify(state.value.plan));plan.settings={...presets[selected.value],count:plan.settings.count};try{await savePlan(plan)}catch(e){message.value=(e as Error).message}}
</script>
<template>
  <div class="page home-page">
    <div class="page-heading"><div><div class="eyebrow">{{new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date())}}</div><h1>오늘도, 차근차근.</h1><p>조금의 연습이 쌓여, 계산에 자신감이 생겨요.</p></div><span class="date-stamp"><AppIcon name="leaf"/> 나의 속도로 한 걸음</span></div>
    <section v-if="!state.onboarded" class="onboarding"><div><b>처음이라면, 시작할 수준을 골라요.</b><p>나중에 학습 계획에서 자유롭게 바꿀 수 있어요.</p></div><div class="onboarding-actions"><select v-model="selected" aria-label="처음 학습 수준"><option value="basic">기초 · 한 자리</option><option value="normal">보통 · 두 자리</option><option value="advanced">심화 · 세 자리 이상</option></select><button class="btn secondary small" :disabled="busy" @click="setup">설정 완료</button></div></section>
    <div class="home-columns"><div>
      <section class="daily-hero"><div class="hero-copy"><span class="hero-eyebrow"><span/> DAILY PRACTICE</span><h2>오늘의 학습</h2><p>{{daily?.status==='completed'?'오늘의 계산 연습을 마쳤어요.':scheduled(state.plan,today)?'가볍게 시작해 볼까요?':'오늘은 계획된 휴식일이에요.'}}<br>서두르지 않아도 괜찮아요.</p><div class="hero-meta"><span><AppIcon name="book" :size="17"/>{{daily?.questions.length??state.plan.settings.count}}문제</span><span><AppIcon name="clock" :size="17"/>약 {{Math.max(1,Math.round(state.plan.settings.count/2))}}분 · 시간 제한 없음</span></div><NuxtLink v-if="daily?.status==='completed'" :to="`/result?id=${daily.id}`" class="btn light">학습 결과 보기<AppIcon name="arrow" :size="18"/></NuxtLink><button v-else class="btn light" :disabled="busy||!scheduled(state.plan,today)" @click="begin">{{daily?'이어서 학습하기':'오늘의 학습 시작'}}<AppIcon name="arrow" :size="18"/></button><NuxtLink v-if="daily&&spacedDue.length" :to="`/learn?id=${daily.id}&review=spaced`" class="btn light spaced-review-link">간격 복습 {{spacedDue.length}}문제<AppIcon name="arrow" :size="18"/></NuxtLink></div><div class="math-art" aria-hidden="true"><div class="art-circle"/><div class="sheet sheet-back"/><div class="sheet sheet-front"><span class="sheet-title">a little, every day.</span><span class="math-line">24 <i>+</i> 15</span><span class="math-line answer-line">= <b>39</b><span class="pencil-check">✓</span></span><div class="sheet-lines"/><div class="sheet-foot">MY MATH NOTE</div></div><span class="art-plus">+</span><span class="art-multiply">×</span></div></section>
      <p v-if="message" role="alert" class="alert">{{message}}</p>
      <section class="daily-breakdown"><div class="section-heading"><h2>오늘의 연습</h2><NuxtLink to="/plan">계획 수정<AppIcon name="chevron" :size="14"/></NuxtLink></div><div class="stage-row"><span class="stage-number">{{daily?.attempts.length??0}}</span><div><h3>{{daily?.questions.length??state.plan.settings.count}}문제를 한 흐름으로 풀어요</h3><p>{{operationLabels}} · 틀린 문제는 두 번 더 도전하고, 마지막에 정답을 확인해요.</p></div><span class="stage-count">{{remainingToday}}<small>남음</small></span></div></section>
      <NuxtLink to="/practice" class="free-banner"><span class="free-icon">±</span><div><h3>더 연습하고 싶은 계산이 있나요?</h3><p>자릿수와 연산을 직접 고르는 자유 학습</p></div><AppIcon name="arrow"/></NuxtLink>
    </div><aside class="home-context"><section class="week-panel"><div class="section-heading"><h2>이번 주 학습</h2><AppIcon name="calendar" :size="19"/></div><div class="week-strip"><div v-for="d in week" :key="d.date" :class="{today:d.active,done:d.done}"><small>{{d.day}}</small><span>{{d.done?'✓':d.number}}</span><i v-if="d.active"/></div></div><p class="muted">{{new Set(weekCompleted.map(s=>s.date)).size}}일 동안 계산을 연습했어요.</p><div class="week-stats"><div><b>{{answered}}</b><span>푼 문제</span></div><div><b>{{accuracy===null?'—':accuracy+'%'}}</b><span>정답률</span></div></div><NuxtLink to="/history" class="text-link">학습 기록 보기<AppIcon name="arrow" :size="16"/></NuxtLink></section>
      <section class="scope-panel"><span class="mini-label">MY LEARNING PLAN</span><h2>지금 연습하는 계산</h2><p>{{operationLabels}}</p><div class="scope-equation"><span>{{digitABoxes}}</span><b>＋</b><span>{{digitBBoxes}}</span></div><div class="scope-tags"><span>{{todaySettings.digitsA}}자리 · {{todaySettings.digitsB}}자리</span><span>{{({easy:'쉬움',normal:'보통',hard:'어려움'})[todaySettings.difficulty]}}</span></div><NuxtLink to="/plan" class="text-link">나에게 맞게 바꾸기<AppIcon name="arrow" :size="16"/></NuxtLink></section>
      <div class="gentle-note"><AppIcon name="leaf"/><p>빠르게 푸는 것보다<br><b>이해하며 푸는 것이 중요해요.</b></p></div></aside></div>
    <section v-if="unfinished.length" class="resume-list"><h2>이어서 할 수 있는 학습</h2><NuxtLink v-for="s in unfinished" :key="s.id" :to="`/learn?id=${s.id}`">{{s.date}} · {{s.type==='daily'?'매일 학습':'자유 학습'}} <span>{{s.attempts.length}} / {{s.questions.length}}문제 <AppIcon name="arrow" :size="16"/></span></NuxtLink></section>
    <footer class="page-footer"><span>AFSR Math</span>작은 연습, 단단한 기초.</footer>
  </div>
</template>
