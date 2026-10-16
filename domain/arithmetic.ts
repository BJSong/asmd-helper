import { settingsSchema, type Settings, type Operator, type Question } from '#shared/model'
import { carryCount, borrowCount, multiplyCarries, complexity } from '#shared/arithmetic-rules'
export { carryCount, borrowCount, multiplyCarries, complexity } from '#shared/arithmetic-rules'
export class GenerationError extends Error {}
export function problemKey(op:Operator,a:number,b:number):string { if((op==='add'||op==='multiply')&&a>b)[a,b]=[b,a];return `${op}:${a}:${b}` }
export function matches(q:Question,s:Settings):boolean {
  const c=complexity(q.operator,q.operandA,q.operandB)
  return s.operators.includes(q.operator)&&String(q.operandA).length===s.digitsA&&String(q.operandB).length===s.digitsB&&c.difficulty===s.difficulty&&(q.operator==='divide'||s.carry==='any'||(s.carry==='required'?c.carry>0:c.carry===0))&&(q.operator!=='subtract'||s.allowNegative||q.operandA>=q.operandB)&&(q.operator!=='divide'||(q.answer>=1&&(s.allowRemainder||q.remainder===0)))
}
export function makeQuestion(op:Operator,a:number,b:number):Question {
  const c=complexity(op,a,b)
  return {id:problemKey(op,a,b),operator:op,operandA:a,operandB:b,answer:op==='add'?a+b:op==='subtract'?a-b:op==='multiply'?a*b:Math.floor(a/b),...(op==='divide'?{quotient:Math.floor(a/b),remainder:a%b}:{}),difficulty:c.difficulty,digitsA:String(a).length,digitsB:String(b).length,carryBorrowType:op==='divide'?'not-applicable':c.carry>0?'required':'none',generationVersion:1}
}
export function generateQuestions(input:Settings,rng= Math.random,excluded=new Set<string>()):Question[] {
  const parsed=settingsSchema.safeParse(input)
  if(!parsed.success)throw new GenerationError('연산과 자릿수, 문제 수(1~100)를 확인해 주세요.')
  const s=parsed.data, minA=10**(s.digitsA-1),maxA=10**s.digitsA-1,minB=10**(s.digitsB-1),maxB=10**s.digitsB-1
  const random=(lo:number,hi:number)=>lo+Math.floor(Math.max(0,Math.min(0.999999999,rng()))*(hi-lo+1))
  const pools=new Map<Operator,Question[]>()
  for(const op of s.operators) {
    const found=new Map<string,Question>()
    const accept=(a:number,b:number)=> {const q=makeQuestion(op,a,b);if(!excluded.has(q.id)&&matches(q,s))found.set(q.id,q)}
    const space=(maxA-minA+1)*(maxB-minB+1)
    if(space<=120000) {for(let a=minA;a<=maxA;a++)for(let b=minB;b<=maxB;b++)accept(a,b)}
    else {for(let i=0;i<60000 && found.size<Math.max(s.count*5,100);i++) {
      const b=random(minB,maxB)
      if(op==='divide'&&!s.allowRemainder) {const lo=Math.max(1,Math.ceil(minA/b)),hi=Math.floor(maxA/b);if(lo<=hi)accept(random(lo,hi)*b,b)} else accept(random(minA,maxA),b)
    }}
    const pool=[...found.values()]
    if(pool.length===0)throw new GenerationError(`${({add:'덧셈',subtract:'뺄셈',multiply:'곱셈',divide:'나눗셈'})[op]}: 이 조건으로 문제를 만들 수 없어요. 난이도나 올림 조건, 자릿수를 확인해 주세요.`)
    for(let i=pool.length-1;i>0;i--){const j=random(0,i);[pool[i],pool[j]]=[pool[j]!,pool[i]!]}
    pools.set(op,pool)
  }
  const result:Question[]=[],startOffset=random(0,s.operators.length-1);let offset=startOffset
  while(result.length<s.count) {
    let added=false
    const order=[...s.operators.slice(offset),...s.operators.slice(0,offset)]
    for(const op of order) {const q=pools.get(op)!.pop();if(q){result.push(q);added=true}if(result.length===s.count)break}
    offset=(offset+1)%s.operators.length
    if(!added)throw new GenerationError(`중복 없이 만들 수 있는 문제가 ${result.length}개예요. 문제 수를 줄이거나 조건을 넓혀 주세요.`)
  }
  return result
}
