<script setup lang="ts">
import {seoulDate,operatorNames} from '#shared/model'
import {scheduled,weekday,nextPosition} from '#domain/learning'
const {state,startDaily,busy}=useLearning()
const message=ref(''),today=seoulDate()
const daily=computed(()=>state.value.sessions.find(s=>s.id===`daily-${today}`))
const todaySettings=computed(()=>state.value.plan.weekdaySettings[String(weekday(today))]??state.value.plan.settings)
const remaining=computed(()=>daily.value?(daily.value.retryPolicyVersion===1?daily.value.questions.length-nextPosition(daily.value):daily.value.questions.length-daily.value.attempts.length):todaySettings.value.count)
const due=computed(()=>daily.value?.scheduledReviewIds.filter(id=>state.value.reviewQueue.some(item=>item.id===id&&item.assignedSessionId===daily.value?.id)).length??0)
const unfinished=computed(()=>state.value.sessions.filter(s=>s.status==='in-progress'&&s.id!==daily.value?.id).slice(-3).reverse())
const operationLabels=computed(()=>todaySettings.value.operators.map(op=>operatorNames[op]).join(' · '))
const dateLabel=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Seoul'}).format(new Date())
async function begin(){message.value='';try{const id=await startDaily();await navigateTo(`/learn?id=${id}`)}catch(e){message.value=(e as Error).message}}
</script>
<template>
  <div class="page home-page kid-home">
    <div class="kid-intro"><span class="kid-date">{{dateLabel}}</span><h1>오늘의 계산, 시작해 볼까?</h1><p>천천히 생각하고 한 문제씩 풀어 봐요.</p></div>
    <section class="kid-stage" :class="{'is-complete':daily?.status==='completed'}">
      <div class="stage-copy">
        <span class="stage-kicker">{{daily?.status==='completed'?'오늘의 연습 완료':scheduled(state.plan,today)?'오늘의 학습':'오늘은 쉬는 날'}}</span>
        <h2>{{daily?.status==='completed'?'오늘도 끝까지 풀었어요!':daily?'남은 문제를 풀어 볼까요?':scheduled(state.plan,today)?'계산 모험을 시작해요!':'다음 학습일에 만나요.'}}</h2>
        <p>{{daily?.status==='completed'?'오늘 풀 수 있는 문제는 마치었어요.':scheduled(state.plan,today)?operationLabels+' · '+(daily?.questions.length??todaySettings.count)+'문제':'쉬는 날도 학습 계획의 일부예요.'}}</p>
        <div v-if="daily?.status!=='completed'&&scheduled(state.plan,today)" class="stage-progress"><span>오늘 풀 문제</span><strong>{{remaining}}<small> / {{daily?.questions.length??todaySettings.count}}</small></strong></div>
        <NuxtLink v-if="daily?.status==='completed'" :to="`/result?id=${daily.id}`" class="btn stage-button">오늘 결과 보기<AppIcon name="arrow" :size="20"/></NuxtLink>
        <button v-else-if="scheduled(state.plan,today)" type="button" class="btn stage-button" :disabled="busy" @click="begin">{{daily?'이어서 학습하기':'오늘의 학습 시작'}}<AppIcon name="arrow" :size="20"/></button>
      </div>
      <div class="stage-art" aria-hidden="true"><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✳</span><div class="art-disc"><span>8</span><b>+</b><span>5</span><i>= ?</i></div><span class="art-spark spark-three">✦</span></div>
    </section>
    <p v-if="message" role="alert" class="alert">{{message}}</p>
    <div class="kid-next">
      <NuxtLink v-if="due&&daily" :to="`/learn?id=${daily.id}&review=spaced`" class="next-action"><span class="next-icon">↻</span><span><b>복습 문제 {{due}}개</b><small>전에 풀었던 문제를 다시 만나 봐요.</small></span><AppIcon name="arrow" :size="20"/></NuxtLink>
      <NuxtLink to="/practice" class="next-action"><span class="next-icon">±</span><span><b>자유 연습</b><small>원하는 계산을 골라 더 풀어 봐요.</small></span><AppIcon name="arrow" :size="20"/></NuxtLink>
    </div>
    <section v-if="unfinished.length" class="resume-list"><h2>이어서 할 수 있는 학습</h2><NuxtLink v-for="s in unfinished" :key="s.id" :to="`/learn?id=${s.id}`">{{s.date}} · {{s.type==='daily'?'매일 학습':'자유 연습'}} <span>{{s.attempts.length}} / {{s.questions.length}}문제 <AppIcon name="arrow" :size="16"/></span></NuxtLink></section>
    <p v-if="!state.onboarded" class="parent-setup-note">학습 조건은 우측 상단 설정 아이콘의 <NuxtLink to="/parent">부모 화면</NuxtLink>에서 바꿀 수 있어요.</p>
  </div>
</template>
