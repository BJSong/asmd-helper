<script setup lang="ts">
const {init,ready,error,mode,signInRequired,signIn,syncStatus,syncError,flushDraft}=useLearning()
const familyPassword=ref(''),signInError=ref(''),signInBusy=ref(false)
async function submitFamilyPassword(){signInError.value='';signInBusy.value=true;try{await signIn(familyPassword.value);familyPassword.value=''}catch(e){signInError.value=e instanceof Error?e.message:'로그인하지 못했어요.'}finally{signInBusy.value=false}}
const route=useRoute()
const focused=computed(()=>route.path==='/learn')
const parentPage=computed(()=>['/parent','/history','/plan','/settings'].includes(route.path))
onMounted(()=>init().catch(()=>{}))
</script>
<template>
  <div class="app-shell playful-shell" :class="{focused,'parent-mode':parentPage}">
    <header v-if="!focused" class="site-header">
      <NuxtLink to="/" class="brand" aria-label="AFSR Math 오늘의 학습"><span class="brand-mark">a<span>+</span></span><span>AFSR <b>Math</b></span></NuxtLink>
      <nav v-if="!parentPage" class="child-nav" aria-label="학습 메뉴"><NuxtLink to="/" :aria-current="route.path==='/'?'page':undefined">오늘의 학습</NuxtLink><NuxtLink to="/practice" :aria-current="route.path==='/practice'?'page':undefined">자유 연습</NuxtLink></nav>
      <NuxtLink v-else to="/parent" class="parent-back"><AppIcon name="chevron" :size="17"/> 부모 화면</NuxtLink>
      <NuxtLink :to="parentPage?'/':'/parent'" class="parent-entry" :aria-label="parentPage?'아이 화면으로 돌아가기':'부모 화면 열기'" :title="parentPage?'아이 화면으로':'부모 화면'"><AppIcon :name="parentPage?'home':'settings'" :size="23"/><span>{{parentPage?'아이 화면':'부모 화면'}}</span></NuxtLink>
    </header>
    <main id="main-content"><div v-if="error" role="alert" class="alert global-alert">{{error}}</div><div v-if="ready&&mode==='cloud'&&syncStatus!=='synced'" :role="syncStatus==='failed'?'alert':'status'" class="alert global-alert">{{syncStatus==='syncing'?'서버에 저장 중이에요.':syncStatus==='failed'?syncError:'답안이 이 기기에 저장됐어요. 학습을 마치면 서버에 반영해요.'}} <button v-if="syncStatus==='failed'" class="btn secondary small" type="button" @click="flushDraft()">서버 저장 다시 시도</button></div><div v-show="ready"><NuxtPage/></div><div v-if="signInRequired&&!ready" class="loading"><span class="brand-mark">a+</span><h1>가족 학습 공간</h1><p>공용 암호를 입력하면 저장된 학습 기록을 불러와요.</p><form @submit.prevent="submitFamilyPassword"><label>가족 공용 암호<input v-model="familyPassword" type="password" autocomplete="current-password" required></label><p v-if="signInError" role="alert" class="alert">{{signInError}}</p><button class="btn" type="submit" :disabled="signInBusy">학습 공간 열기</button></form></div><div v-else-if="!ready" class="loading"><span class="brand-mark">a+</span><p>{{error?'저장소 연결을 확인해 주세요.':'학습 노트를 열고 있어요…'}}</p><button v-if="error" class="btn" @click="init().catch(()=>{})">다시 시도</button></div></main>
  </div>
</template>
