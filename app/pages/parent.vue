<script setup lang="ts">
import {operatorNames} from '#shared/model'
import {summary} from '#domain/learning'
const {state,mode}=useLearning()
const completed=computed(()=>state.value.sessions.filter(session=>session.status==='completed'))
const recent=computed(()=>completed.value.slice(-5))
const firstAnswers=computed(()=>recent.value.flatMap(session=>session.attempts))
const accuracy=computed(()=>firstAnswers.value.length?Math.round(firstAnswers.value.filter(attempt=>attempt.correct).length/firstAnswers.value.length*100):null)
const operators=computed(()=>state.value.plan.settings.operators.map(operator=>operatorNames[operator]).join(' · '))
</script>
<template>
  <div class="page parent-hub">
    <div class="eyebrow">PARENT SPACE</div><h1>부모 화면</h1><p class="page-intro">학습 기록을 살펴보고 다음 연습을 조정할 수 있어요.</p>
    <section class="parent-snapshot" aria-label="최근 학습 요약">
      <div><span>최근 완료한 학습</span><strong>{{recent.length}}<small>회</small></strong></div>
      <div><span>첫 답안 정답률</span><strong>{{accuracy===null?'—':accuracy+'%'}}</strong></div>
      <p>최근 최대 5개 완료 세션 · {{firstAnswers.length}}문제 기준</p>
    </section>
    <nav class="parent-links" aria-label="부모 메뉴">
      <NuxtLink to="/history"><span class="parent-link-icon"><AppIcon name="calendar" :size="25"/></span><span><b>학습 기록과 통계</b><small>날짜별 학습과 첫 답안 결과 확인</small></span><AppIcon name="chevron" :size="21"/></NuxtLink>
      <NuxtLink to="/plan"><span class="parent-link-icon"><AppIcon name="sliders" :size="25"/></span><span><b>학습 계획</b><small>요일, 연산, 자릿수와 문제 수 설정</small></span><AppIcon name="chevron" :size="21"/></NuxtLink>
      <NuxtLink to="/settings"><span class="parent-link-icon"><AppIcon name="settings" :size="25"/></span><span><b>데이터 및 설정</b><small>복습 상한, 백업, 저장소 관리</small></span><AppIcon name="chevron" :size="21"/></NuxtLink>
    </nav>
    <p class="parent-current">현재 계획: {{operators}} · {{state.plan.settings.count}}문제 <span>저장: {{mode==='cloud'?'클라우드':'이 기기'}}</span></p>
  </div>
</template>
