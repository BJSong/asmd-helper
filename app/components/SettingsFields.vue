<script setup lang="ts">
import {type Settings,operatorNames,type Operator} from '#shared/model'
const model=defineModel<Settings>({required:true})
defineProps<{compact?:boolean;hideCount?:boolean}>()
function toggle(op:Operator){const ops=model.value.operators;model.value={...model.value,operators:ops.includes(op)?ops.filter(x=>x!==op):[...ops,op]}}
</script>
<template>
  <div class="settings-fields">
    <fieldset><legend>연산 종류 <span>함께 연습할 연산을 골라요</span></legend><div class="operation-options"><button v-for="(name,op) in operatorNames" :key="op" type="button" :aria-pressed="model.operators.includes(op)" :class="{active:model.operators.includes(op)}" @click="toggle(op)"><b>{{({add:'+',subtract:'−',multiply:'×',divide:'÷'})[op]}}</b>{{name}}<span>{{model.operators.includes(op)?'✓':''}}</span></button></div></fieldset>
    <div class="form-grid"><label>첫 번째 수<select v-model.number="model.digitsA"><option v-for="n in 4" :key="n" :value="n">{{n}}자리 ({{10**(n-1)}}–{{10**n-1}})</option></select></label><label>두 번째 수<select v-model.number="model.digitsB"><option v-for="n in 4" :key="n" :value="n">{{n}}자리 ({{10**(n-1)}}–{{10**n-1}})</option></select></label></div>
    <div class="form-grid"><label>계산 난이도<select v-model="model.difficulty"><option value="easy">쉬움 · 단순한 계산</option><option value="normal">보통 · 계산 단계 추가</option><option value="hard">어려움 · 복잡한 계산</option></select></label><label>받아올림 · 받아내림<select v-model="model.carry" :disabled="model.operators.length===1&&model.operators[0]==='divide'"><option value="any">무관</option><option value="none">없음</option><option value="required">있음 (1회 이상)</option></select></label></div>
    <label v-if="!hideCount">문제 수<div class="count-options"><button v-for="n in [10,20,30]" :key="n" type="button" :class="{active:model.count===n}" @click="model.count=n">{{n}}문제</button><input v-model.number="model.count" type="number" min="1" max="100" aria-label="사용자 지정 문제 수"><span>문제</span></div></label>
    <div v-if="!compact" class="switch-list"><label><span>음수 결과 허용<small>뺄셈의 답이 0보다 작을 수 있어요.</small></span><input v-model="model.allowNegative" type="checkbox" role="switch"></label><label><span>나머지 있는 나눗셈<small>몫과 나머지를 따로 입력해요.</small></span><input v-model="model.allowRemainder" type="checkbox" role="switch"></label><label><span>풀이 시간 표시<small>시간 제한 없이, 나의 속도로 풀어요.</small></span><input v-model="model.showTime" type="checkbox" role="switch"></label></div>
  </div>
</template>
