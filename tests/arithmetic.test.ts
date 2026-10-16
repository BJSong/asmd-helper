import {describe,it,expect} from 'vitest'
import {generateQuestions,GenerationError,carryCount,borrowCount,multiplyCarries,matches,makeQuestion} from '../domain/arithmetic'
import {presets} from '../shared/model'
const seq=(values:number[])=>{let i=0;return()=>values[i++%values.length]!}
describe('사칙연산 문제 엔진',()=>{
 it('정확한 덧셈/뺄셈/곱셈/나눗셈을 만들고 자릿수를 보존한다',()=>{for(const op of ['add','subtract','multiply','divide'] as const){const s={...presets.normal,operators:[op],digitsA:2,digitsB:1,difficulty:'easy' as const,count:1,carry:'any' as const};if(op==='subtract')s.allowNegative=false;if(op==='divide'){s.difficulty='normal';s.digitsA=3;s.digitsB=1;s.allowRemainder=false}const [q]=generateQuestions(s,()=>0.25);expect(String(q!.operandA).length).toBe(s.digitsA);expect(String(q!.operandB).length).toBe(s.digitsB);if(op==='add')expect(q!.answer).toBe(q!.operandA+q!.operandB);if(op==='subtract')expect(q!.answer).toBe(q!.operandA-q!.operandB);if(op==='multiply')expect(q!.answer).toBe(q!.operandA*q!.operandB);if(op==='divide'){expect(q!.operandA%q!.operandB).toBe(0);expect(q!.quotient).toBe(q!.answer)}}})
 it('올림, 받아내림과 세로셈 곱셈 올림을 세어 난이도를 결정한다',()=>{expect(carryCount(59,68)).toBe(2);expect(borrowCount(302,178)).toBe(2);expect(multiplyCarries(16,17)).toBeGreaterThan(0);expect(matches({...generateQuestions({...presets.basic,count:1,carry:'required',digitsA:2,digitsB:2,difficulty:'normal'},()=>0)[0]!}, {...presets.basic,count:1,carry:'required',digitsA:2,digitsB:2,difficulty:'normal'})).toBe(true)})
 it('교환 가능한 조합을 중복으로 취급하고 공급량 부족을 보고한다',()=>{const s={...presets.basic,operators:['add' as const],digitsA:1,digitsB:1,difficulty:'easy' as const,count:10,carry:'any' as const};const excluded=new Set<string>();for(let a=1;a<=9;a++)for(let b=a;b<=9;b++)excluded.add(`add:${a}:${b}`);expect(()=>generateQuestions(s,()=>0,excluded)).toThrow(GenerationError)})
 it('설정과 충돌하는 난이도/올림 조건을 자동으로 바꾸지 않는다',()=>{expect(()=>generateQuestions({...presets.basic,digitsA:1,digitsB:1,difficulty:'hard',count:1},seq([0.1]))).toThrow(/문제를 만들 수 없어요/);expect(generateQuestions({...presets.basic,operators:['divide'],carry:'required',count:1})[0]!.operator).toBe('divide')})
 it('나머지 허용 시 몫과 나머지를 정수로 각각 기록한다',()=>{const s={...presets.basic,operators:['divide'] as const,digitsA:2,digitsB:1,difficulty:'easy' as const,allowRemainder:true,count:5};const qs=generateQuestions(s,seq([0.1,0.2,0.35,0.55]));for(const q of qs){expect(q.remainder).toBe(q.operandA%q.operandB);expect(q.quotient).toBe(Math.floor(q.operandA/q.operandB));expect(q.answer).toBeGreaterThan(0)}})
 it('1~3자리 전 조합에서 받아올림·받아내림을 자리별 기준값과 대조한다',()=>{
  const refCarry=(a:number,b:number)=>{let carry=0,n=0;while(a||b){const value=a%10+b%10+carry;carry=value>=10?1:0;n+=carry;a=Math.floor(a/10);b=Math.floor(b/10)}return n}
  const refBorrow=(a:number,b:number)=>{let borrow=0,n=0;while(a||b){const value=a%10-borrow-b%10;borrow=value<0?1:0;n+=borrow;a=Math.floor(a/10);b=Math.floor(b/10)}return n}
  for(let a=1;a<=999;a++)for(let b=1;b<=999;b++){expect(carryCount(a,b)).toBe(refCarry(a,b));expect(borrowCount(a,b)).toBe(a>=b?refBorrow(a,b):refBorrow(b,a))}
 },30000)
 it('1~3자리 모든 곱셈 조합에서 각 부분곱 및 세로합 올림 수를 대조한다',()=>{
  const ref=(a:number,b:number)=>{let count=0;const rows:number[]=[];for(let shift=0,n=b;n>0;shift++,n=Math.floor(n/10)){const digit=n%10;let carry=0;for(let x=a;x>0;x=Math.floor(x/10)){const step=x%10*digit+carry;carry=Math.floor(step/10);if(carry)count++}rows.push(a*digit*10**shift)}let carry=0;for(let place=1;place<=Math.max(...rows);place*=10){const sum=rows.reduce((v,row)=>v+Math.floor(row/place)%10,0)+carry;carry=Math.floor(sum/10);if(carry)count++}return count}
  for(let a=1;a<=999;a++)for(let b=1;b<=999;b++)expect(multiplyCarries(a,b)).toBe(ref(a,b))
 },30000)
 it('1~2자리 입력 공간의 모든 피연산자에서 연산 결과와 조건 필터를 검증한다',()=>{
  for(const op of ['add','subtract','multiply','divide'] as const)for(let a=1;a<=99;a++)for(let b=1;b<=99;b++){
   const q=makeQuestion(op,a,b)
   expect(q.answer).toBe(op==='add'?a+b:op==='subtract'?a-b:op==='multiply'?a*b:Math.floor(a/b))
   if(op==='divide'){expect(q.remainder).toBe(a%b);expect(q.quotient).toBe(Math.floor(a/b))}
   for(const difficulty of ['easy','normal','hard'] as const)for(const carry of ['any','none','required'] as const)for(const allowNegative of [false,true])for(const allowRemainder of [false,true]){
    const s={...presets.basic,operators:[op],digitsA:String(a).length,digitsB:String(b).length,difficulty,carry,allowNegative,allowRemainder,count:1}
    const expected=(op==='subtract'||op==='add'||op==='multiply'||op==='divide')&&q.difficulty===difficulty&&(op==='divide'||carry==='any'||(carry==='required'?q.carryBorrowType==='required':q.carryBorrowType==='none'))&&(op!=='subtract'||allowNegative||a>=b)&&(op!=='divide'||(q.answer>=1&&(allowRemainder||q.remainder===0)))
    expect(matches(q,s)).toBe(expected)
   }
  }
 },30000)
 it('문제 풀이 공급이 모자라면 생성 가능한 수를 보고하고 비정상 RNG에서도 종료한다',()=>{
  const settings={...presets.basic,operators:['add'] as const,digitsA:1,digitsB:1,difficulty:'easy' as const,count:100}
  expect(()=>generateQuestions(settings,()=>0)).toThrow(/중복 없이 만들 수 있는 문제가/)
  expect(()=>generateQuestions({...settings,count:1},()=>Number.NaN)).toThrow(GenerationError)
 })
 it('혼합 문제는 선택한 연산 범위 안에서 유형 수를 고르게 배치한다',()=>{
  const qs=generateQuestions({...presets.normal,operators:['add','subtract'],count:9},()=>0.41),counts=qs.reduce((all,q)=>({...all,[q.operator]:(all[q.operator]??0)+1}),{} as Record<string,number>)
  expect(Object.keys(counts).sort()).toEqual(['add','subtract']);expect(Math.abs(counts.add!-counts.subtract!)).toBeLessThanOrEqual(1)
 })
})
