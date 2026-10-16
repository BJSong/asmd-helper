<script setup lang="ts">
import {symbols,operatorNames,answerSchema,type Question,type Operator} from '#shared/model'
import {reviewed,formatDuration,nextPosition,retryCount,reviewRetryCount,reviewResolved} from '#domain/learning'
const route=useRoute(),{session,answer,spacedAnswer,setSpacedReviewPosition,busy,init,state}=useLearning(),id=String(route.query.id??''),isReview=route.query.review==='1',isSpaced=route.query.review==='spaced'
const current=computed(()=>session(id)),reviewEntries=ref<{sourceQuestionId:string;question:import('#shared/model').Question}[]>([]),reviewIndex=ref(0),value=ref(''),remainder=ref(''),feedback=ref<{correct:boolean;answer:string;revealed:boolean}|null>(null),error=ref(''),input=ref<HTMLInputElement|null>(null)
const spacedEntries=ref<{id:string;question:Question}[]>([])
const questions=computed(()=>isSpaced?spacedEntries.value.map(x=>x.question):isReview?reviewEntries.value.map(x=>x.question):current.value?.questions??[])
const position=computed(()=>isSpaced||isReview?reviewIndex.value:current.value?(current.value.retryPolicyVersion===1?nextPosition(current.value):current.value.attempts.length):0)
const activeId=ref(''),selectedOperator=ref<Operator|null>(null)
const question=computed(()=>isSpaced?spacedEntries.value.find(x=>x.question.id===activeId.value)?.question:isReview?reviewEntries.value.find(x=>x.question.id===activeId.value)?.question:current.value?.questions.find(q=>q.id===activeId.value))
const spacedItem=computed(()=>spacedEntries.value.find(x=>x.question.id===activeId.value))
const assignedReviewCount=computed(()=>current.value?.scheduledReviewIds.filter(rid=>state.value.reviewQueue.some(x=>x.id===rid&&x.assignedSessionId===current.value?.id)).length??0)
const activeRetryCount=computed(()=>current.value&&question.value?(isSpaced?Math.max(0,(state.value.reviewQueue.find(x=>x.id===spacedItem.value?.id)?.attemptsThisSession??0)-1):isReview?reviewRetryCount(current.value,question.value.id):retryCount(current.value,question.value.id)):0)
const canRetry=computed(()=>feedback.value?.correct===false&&activeRetryCount.value<2&&current.value?.retryPolicyVersion===1)
const questionPrompt=computed(()=>current.value?.mixedRecognition&&!isReview&&!isSpaced&&!selectedOperator.value?'연산 기호를 고른 뒤 답을 계산해 보세요.':isSpaced?'간격 복습 · 이전에 틀렸던 문제예요.':isReview?'틀렸던 계산과 비슷한 문제예요. 풀어 볼까요?':activeRetryCount.value?`다시 시도 ${activeRetryCount.value}/2 · 답을 차근차근 확인해 보세요.`:'빈칸에 알맞은 답을 써 보세요.')
const feedbackMessage=computed(()=>feedback.value?.correct?'맞았어요.':feedback.value?.revealed?'도전 횟수를 마쳤어요.':'아직 아니에요. 다시 계산해 볼까요?')
const retryHint=computed(()=>activeRetryCount.value===0?'두 번 더 풀 수 있어요.':'한 번 더 풀 수 있어요.')
const feedbackActionLabel=computed(()=>canRetry.value?`다시 풀기 (${activeRetryCount.value+1}/2)`:position.value>=questions.value.length-1?'결과 보기':isReview?'다음 복습 문제':'다음 문제')
const showRemainder=computed(()=>!!current.value?.settings.allowRemainder&&(current.value.mixedRecognition?selectedOperator.value==='divide':question.value?.operator==='divide'))
const elapsed=ref(0);let activeMs=0,inactiveMs=0,last=0,timer:ReturnType<typeof setInterval>|undefined
function tick(){const now=performance.now(),delta=Math.max(0,now-last);last=now;if(feedback.value)return;if(document.hidden)inactiveMs+=delta;else activeMs+=Math.min(delta,5000);elapsed.value=activeMs}
function resetClock(){activeMs=0;inactiveMs=0;elapsed.value=0;last=performance.now()}
function loadQuestion(){activeId.value=questions.value[position.value]?.id??'';selectedOperator.value=null;feedback.value=null;value.value='';remainder.value='';resetClock();nextTick(()=>input.value?.focus())}
onMounted(async()=>{try{await init()}catch{return}if(!current.value)return;if(isSpaced){const ids=current.value.scheduledReviewIds,rawPosition=current.value.spacedReviewPosition,items=ids.map(rid=>state.value.reviewQueue.find(x=>x.id===rid)).filter((x):x is NonNullable<typeof x>=>!!x),skipped=ids.slice(0,rawPosition).filter(rid=>state.value.reviewQueue.find(x=>x.id===rid)?.assignedSessionId!==current.value!.id).length;spacedEntries.value=items.filter(x=>x.assignedSessionId===current.value!.id).map(x=>({id:x.id,question:x.question}));reviewIndex.value=Math.min(Math.max(0,rawPosition-skipped),Math.max(0,spacedEntries.value.length-1))}if(isReview)reviewEntries.value=current.value.reviewQuestions.length?current.value.reviewQuestions.filter(x=>!reviewResolved(current.value!,x.question.id)):current.value.attempts.filter(a=>!a.correct&&!reviewed(current.value!,a.questionId)).map(a=>({sourceQuestionId:a.questionId,question:current.value!.questions.find(q=>q.id===a.questionId)!}));if((!isReview&&!isSpaced&&current.value.status==='completed')||(isReview&&!reviewEntries.value.length)||(isSpaced&&!spacedEntries.value.length)){navigateTo(`/result?id=${id}`);return}loadQuestion();if(isSpaced){const item=spacedItem.value&&state.value.reviewQueue.find(x=>x.id===spacedItem.value!.id);const last=item?.attempts.at(-1);if(item&&last&&item.lastAttemptSession===state.value.sessionCounter&&item.attemptsThisSession>0)feedback.value={correct:last.correct,answer:!last.correct&&item.attemptsThisSession>=3?String(item.question.answer):'',revealed:!last.correct&&item.attemptsThisSession>=3}}timer=setInterval(tick,250);document.addEventListener('visibilitychange',tick)})
onBeforeUnmount(()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',tick)})
async function send(){if(feedback.value||busy.value||!question.value)return;error.value='';const q=question.value
 if(current.value?.mixedRecognition&&!isReview&&!isSpaced&&!selectedOperator.value){error.value='먼저 연산 종류를 골라 주세요.';return}
 const submittedOperator=current.value?.mixedRecognition&&!isReview&&!isSpaced?selectedOperator.value:q.operator,isDivision=submittedOperator==='divide'
 if(!/^-?\d+$/.test(value.value.trim())||(isDivision&&current.value?.settings.allowRemainder&&!/^\d+$/.test(remainder.value.trim()))){error.value='정수로 답을 입력해 주세요.';return}
 const parsed=answerSchema.safeParse({value:Number(value.value),...(isDivision?{remainder:Number(remainder.value||0)}:{}),...(current.value?.mixedRecognition&&!isReview&&!isSpaced?{operator:submittedOperator}:{})});if(!parsed.success){error.value='입력한 수를 다시 확인해 주세요.';return}
 tick();const hasReviewQuestion=current.value!.reviewQuestions.some(x=>x.question.id===q.id);const kind=isReview?(hasReviewQuestion?(current.value!.reviewAttempts.some(a=>a.questionId===q.id)?'reviewRetry':'review'):'review'):current.value!.attempts.some(a=>a.questionId===q.id)?'retry':'first';try{if(isSpaced){await spacedAnswer(id,spacedItem.value!.id,parsed.data,activeMs);const item=state.value.reviewQueue.find(x=>x.id===spacedItem.value!.id)!;const saved=item.attempts.at(-1)!;feedback.value={correct:saved.correct,answer:!saved.correct&&item.attemptsThisSession>=3?String(q.answer):'',revealed:!saved.correct&&item.attemptsThisSession>=3};return}await answer(id,q.id,parsed.data,activeMs,inactiveMs,kind);const saved=(kind==='review'?(hasReviewQuestion?current.value!.reviewAttempts:current.value!.reviews):kind==='reviewRetry'?current.value!.reviewRetries:kind==='retry'?current.value!.retries:current.value!.attempts).filter(a=>a.questionId===q.id).at(-1)!;const retryNumber=isReview?reviewRetryCount(current.value!,q.id):retryCount(current.value!,q.id);const revealed=!saved.correct&&(current.value!.retryPolicyVersion!==1||(!hasReviewQuestion&&isReview)||retryNumber>=2);feedback.value={correct:saved.correct,answer:revealed?(q.operator==='divide'&&q.remainder?`${q.answer}, 나머지 ${q.remainder}`:String(q.answer)):'',revealed}}catch(e){error.value=(e as Error).message}}
async function next(){if(!feedback.value)return;if(isReview||isSpaced)reviewIndex.value++;if(isSpaced)await setSpacedReviewPosition(id,reviewIndex.value);if(position.value>=questions.value.length){await navigateTo(`/result?id=${id}`);return}loadQuestion()}
function feedbackAction(){if(canRetry.value)loadQuestion();else void next()}
function onEnter(event:KeyboardEvent){if(event.repeat)return;if(feedback.value){event.preventDefault();feedbackAction()}}
</script>
<template>
  <div v-if="current" class="learning-page">
    <header class="learning-header"><NuxtLink to="/" class="brand"><span class="brand-mark">a<span>+</span></span><span>AFSR <b>Math</b></span></NuxtLink><div class="learning-header-actions"><NuxtLink v-if="assignedReviewCount&&!isSpaced" :to="`/learn?id=${id}&review=spaced`" class="btn secondary small">간격 복습 {{assignedReviewCount}}문제</NuxtLink><button class="btn ghost small" :disabled="busy" @click="navigateTo('/')">저장하고 나가기<AppIcon name="close" :size="17"/></button></div></header>
    <div class="learning-body">
      <div class="learning-label"><span>{{isReview?'유사 복습 문제':current.type==='daily'?'오늘의 학습':'자유 학습'}}</span><b>{{Math.min(position+1,questions.length)}} <span>/ {{questions.length}}</span></b></div>
      <div class="progress-track" role="progressbar" :aria-valuenow="position" :aria-valuemax="questions.length" :aria-valuemin="0" aria-label="학습 진행률"><span :style="{width:`${position/questions.length*100}%`}"/></div>
      <div v-if="question" class="question-workspace">
        <p class="question-prompt">{{questionPrompt}}</p>
        <div v-if="current.mixedRecognition&&!isReview&&!isSpaced" class="operator-choice" role="group" aria-label="연산 종류 선택"><button v-for="op in current.settings.operators" :key="op" type="button" :aria-pressed="selectedOperator===op" :disabled="!!feedback||busy" @click="selectedOperator=op"><b>{{symbols[op]}}</b>{{operatorNames[op]}}</button></div>
        <div class="equation" data-testid="equation"><span>{{question.operandA}}</span><b>{{current.mixedRecognition&&!isReview&&!isSpaced?(selectedOperator?symbols[selectedOperator]:'?'):symbols[question.operator]}}</b><span>{{question.operandB}}</span><b>=</b><span class="answer-placeholder">?</span></div>
        <form class="answer-form" @submit.prevent="send" @keydown.enter="onEnter">
          <div class="answer-inputs">
            <label><span>{{(current.mixedRecognition?selectedOperator==='divide':question.operator==='divide')?'몫':'정답'}}</span><input ref="input" v-model="value" :disabled="!!feedback||busy" :inputmode="current.settings.allowNegative?'text':'numeric'" autocomplete="off" aria-label="정답" placeholder="답 입력"></label>
            <label v-if="showRemainder"><span>나머지</span><input v-model="remainder" :disabled="!!feedback||busy" inputmode="numeric" autocomplete="off" aria-label="나머지" placeholder="0"></label>
          </div>
          <p v-if="error" class="alert" role="alert">{{error}}</p>
          <div v-if="feedback" class="answer-feedback" role="status">
            <b>{{feedbackMessage}}</b>
            <span v-if="feedback.revealed">정답은 {{feedback.answer}}예요.</span>
            <span v-else-if="!feedback.correct&&!isReview">{{isSpaced?'세 번까지 다시 풀 수 있어요.':retryHint}}</span>
            <button type="button" class="btn" @click="feedbackAction">{{feedbackActionLabel}}<AppIcon name="arrow" :size="18"/></button>
          </div>
          <button v-else class="btn submit-answer" type="submit" :disabled="busy||!value.trim()">{{busy?'답안 저장 중…':'정답 확인'}}<AppIcon name="arrow" :size="18"/></button>
          <p class="input-hint">Enter 키로 답을 확인할 수 있어요.</p>
        </form>
        <p v-if="current.settings.showTime" class="time-display"><AppIcon name="clock" :size="16"/>{{formatDuration(elapsed)}} · 천천히 풀어도 괜찮아요</p>
      </div>
      <div class="save-hint"><i/>제출한 답은 자동으로 저장돼요.</div>
    </div>
  </div>
  <div v-else class="page"><h1>학습 기록을 찾을 수 없어요.</h1><NuxtLink to="/" class="btn">홈으로</NuxtLink></div>
</template>
