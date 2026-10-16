<script setup lang="ts">
const {init,ready,error,mode}=useLearning()
const route=useRoute()
const focused=computed(()=>route.path==='/learn')
const links=[{to:'/',name:'오늘의 학습',icon:'home'},{to:'/practice',name:'자유 학습',icon:'book'},{to:'/history',name:'학습 기록',icon:'calendar'},{to:'/plan',name:'학습 계획',icon:'sliders'},{to:'/settings',name:'설정',icon:'settings'}]
onMounted(()=>init().catch(()=>{}))
</script>
<template>
  <div class="app-shell" :class="{focused}">
    <aside v-if="!focused" class="sidebar">
      <NuxtLink to="/" class="brand" aria-label="AFSR Math 홈"><span class="brand-mark">a<span>+</span></span><span>AFSR <b>Math</b><small>나의 작은 수학 습관</small></span></NuxtLink>
      <div class="nav-caption">MY LEARNING</div>
      <nav aria-label="주 메뉴"><NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="nav-item" :class="{selected:route.path===link.to}"><AppIcon :name="link.icon"/><span>{{link.name}}</span><span v-if="route.path===link.to" class="nav-dot"/></NuxtLink></nav>
      <div class="sidebar-bottom"><div class="quiet-note"><AppIcon name="leaf" :size="23"/><p>조금씩, 꾸준히.<br><span>나의 속도로 배워요.</span></p></div><div class="local-status"><i/>{{mode==='local'?'이 기기에 저장 중':'Supabase에 저장 중'}}</div></div>
    </aside>
    <div class="main-shell">
      <header v-if="!focused" class="topbar"><span>매일 조금씩, 단단한 계산</span><div><span class="status-tag">{{mode==='local'?'개인 학습 공간':'클라우드 학습 공간'}}</span><span class="avatar">나</span></div></header>
      <main id="main-content"><div v-if="error" role="alert" class="alert">{{error}}</div><NuxtPage/><div v-if="!ready" class="loading"><span class="brand-mark">a+</span><p>{{error?'저장소 연결을 확인해 주세요.':'학습 노트를 열고 있어요…'}}</p><button v-if="error" class="btn" @click="init().catch(()=>{})">다시 시도</button></div></main>
    </div>
  </div>
</template>
