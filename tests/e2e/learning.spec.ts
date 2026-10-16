import { test, expect } from '@playwright/test'

function equation(text:string){
 const match=text.match(/(-?\d+)\s*([+−×÷])\s*(-?\d+)/)
 if(!match)throw new Error(`Could not read the displayed problem: ${text}`)
 const [,left,operator,right]=match,a=Number(left),b=Number(right)
 const answer=operator==='+'?a+b:operator==='−'?a-b:operator==='×'?a*b:Math.floor(a/b)
 const remainder=operator==='÷'?a%b:0
 return {answer,remainder}
}
async function submitAnswer(page:any,wrong=false){
 const {answer}=equation(await page.getByTestId('equation').innerText())
 const expected=wrong?answer+1:answer
 await page.getByLabel('정답').fill(String(expected))
 await page.getByRole('button',{name:'정답 확인'}).click()
 await expect(page.getByRole('status')).toBeVisible()
 if(!wrong)await expect(page.getByRole('status')).toContainText('맞았어요.')
}
async function answerQuestion(page:any){
 await submitAnswer(page,false)
 const next=page.getByRole('button',{name:'다음 문제'})
 if(await next.count())await next.click()
 else await page.getByRole('button',{name:'결과 보기'}).click()
}

test('매일 학습을 저장하고 새로고침 후 이어서 오답 복습한다',async({page})=>{
 await page.goto('/')
 const startButton=page.getByRole('button',{name:'오늘의 학습 시작'})
 const setup=page.getByRole('button',{name:'설정 완료'})
 if(await setup.count()){await page.getByLabel('처음 학습 수준').selectOption('basic');await setup.click()}
 await expect(startButton).toBeVisible()
 await startButton.click()
 await expect(page.getByTestId('equation')).toBeVisible()
 const originalQuestion=await page.getByTestId('equation').innerText()
 await expect(page.getByText('선택형 계산 원리 보기')).toHaveCount(0)
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).not.toContainText('정답은')
 await page.getByRole('button',{name:'다시 풀기 (1/2)'}).click()
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).not.toContainText('정답은')
 await page.getByRole('button',{name:'다시 풀기 (2/2)'}).click()
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).toContainText('정답은')
 await page.getByRole('button',{name:'다음 문제'}).click()
 await page.reload()
 await expect(page.getByTestId('equation')).toBeVisible()
 for(let i=0;i<19;i++){
  await answerQuestion(page)
  if(page.url().includes('/result'))break
 }
 await expect(page.getByRole('heading',{name:'오늘의 연습을 마쳤어요.'})).toBeVisible()
 await expect(page.getByText('정답률은 첫 답안 기준이에요. 다시 도전한 결과와 복습 결과는 따로 저장돼요.')).toBeVisible()
 await page.getByRole('link',{name:'유사 문제 1문제 복습'}).click()
 await expect(page.getByText('틀렸던 계산과 비슷한 문제예요. 풀어 볼까요?')).toBeVisible()
 expect(await page.getByTestId('equation').innerText()).not.toBe(originalQuestion)
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).not.toContainText('정답은')
 await page.getByRole('button',{name:'다시 풀기 (1/2)'}).click()
 await submitAnswer(page,true)
 await page.getByRole('button',{name:'다시 풀기 (2/2)'}).click()
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).toContainText('정답은')
 await page.getByRole('button',{name:'결과 보기'}).click()
 await expect(page.getByRole('heading',{name:'오늘의 연습을 마쳤어요.'})).toBeVisible()
 await expect(page.getByText('✓ 복습 완료')).toBeVisible()
 await page.goto('/practice')
 await page.getByLabel('사용자 지정 문제 수').fill('1')
 await page.getByRole('button',{name:'학습 시작'}).click()
 await answerQuestion(page)
 await expect(page.getByRole('link',{name:'간격 복습 1문제'})).toBeVisible()
 await page.getByRole('link',{name:'간격 복습 1문제'}).click()
 await expect(page.getByText('간격 복습 · 이전에 틀렸던 문제예요.')).toBeVisible()
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).not.toContainText('정답은')
 await page.reload()
 await expect(page.getByRole('button',{name:'다시 풀기 (1/2)'})).toBeVisible()
 await page.getByRole('button',{name:'다시 풀기 (1/2)'}).click()
 await submitAnswer(page,true)
 await page.getByRole('button',{name:'다시 풀기 (2/2)'}).click()
 await submitAnswer(page,true)
 await expect(page.getByRole('status')).toContainText('정답은')
})

test('혼합 연습은 학습 기록이 있는 연산 기호만 감추고 다시 선택하게 한다',async({page})=>{
 async function setOperator(name:'덧셈'|'뺄셈',selected:boolean){const button=page.locator('.settings-fields').first().getByRole('button',{name:new RegExp(name)});if((await button.getAttribute('aria-pressed'))!==String(selected))await button.click()}
 async function practiceOnly(name:'덧셈'|'뺄셈'){
  await page.goto('/practice');await setOperator('덧셈',name==='덧셈');await setOperator('뺄셈',name==='뺄셈');await page.getByLabel('사용자 지정 문제 수').fill('1');await page.getByRole('button',{name:'학습 시작'}).click();await answerQuestion(page)
 }
 await practiceOnly('덧셈');await practiceOnly('뺄셈')
 await page.goto('/practice');await setOperator('덧셈',true);await setOperator('뺄셈',true);await page.getByLabel('사용자 지정 문제 수').fill('1')
 const mix=page.locator('.mixed-option input');await expect(mix).toBeEnabled();await mix.check()
 await page.getByRole('button',{name:'학습 시작'}).click()
 await expect(page.getByRole('group',{name:'연산 종류 선택'})).toBeVisible()
 const raw=await page.getByTestId('equation').innerText();expect(raw).toContain('?')
 const op=await page.evaluate(async()=>{const request=indexedDB.open('afsr-math-v1');const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('state','readonly');const get=tx.objectStore('state').get('main');get.onsuccess=()=>resolve(get.result.sessions.at(-1).questions[0].operator);get.onerror=()=>reject(get.error)})})
 await page.getByRole('group',{name:'연산 종류 선택'}).getByRole('button',{name:op==='add'?'덧셈':'뺄셈'}).click()
 await submitAnswer(page,false)
 await expect(page.getByRole('status')).toContainText('맞았어요.')
})

test('클라우드 API는 기본 설정에서 닫혀 있다',async({request})=>{
 const response=await request.get('/api/cloud/state')
 expect(response.status()).toBe(503)
})

test('학습 계획에서 바꾼 연산은 새 과제와 새로고침 후 설정에 반영된다',async({page})=>{
 await page.goto('/plan')
 await expect(page.getByRole('heading',{name:'나의 학습 계획'})).toBeVisible()
 const operations=page.locator('.settings-fields').first()
 await operations.getByRole('button',{name:/곱셈/}).click()
 await operations.getByRole('button',{name:/덧셈/}).click()
 await page.getByRole('button',{name:'계획 저장'}).click()
 await expect(page.getByRole('status')).toContainText('다음 새 과제부터 적용돼요.')
 await page.reload()
 const restored=page.locator('.settings-fields').first()
 await expect(restored.getByRole('button',{name:/곱셈/})).toHaveAttribute('aria-pressed','true')
 await expect(restored.getByRole('button',{name:/덧셈/})).toHaveAttribute('aria-pressed','false')
})

test('작은 화면에서 주 메뉴와 핵심 화면이 가로로 밀리지 않는다',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/')
 await expect(page.getByRole('link',{name:'설정'})).toBeVisible()
 const widths=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}))
 expect(widths.content).toBeLessThanOrEqual(widths.viewport)
})

test('설정 변경과 JSON 백업·복원·삭제가 새로고침 후에도 일치한다',async({page})=>{
 await page.goto('/settings')
 const limit=page.getByLabel('한 학습 세션의 복습 상한')
 await limit.selectOption('3')
 await expect(limit).toHaveValue('3')
 await expect.poll(async()=>page.evaluate(async()=>{const request=indexedDB.open('afsr-math-v1');const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return await new Promise<number>((resolve,reject)=>{const tx=db.transaction('state','readonly');const get=tx.objectStore('state').get('main');get.onsuccess=()=>resolve(get.result?.reviewQuestionLimit);get.onerror=()=>reject(get.error)})})).toBe(3)
 await page.reload()
 await expect(limit).toHaveValue('3')
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('button',{name:'JSON 내보내기'}).click()
 const download=await downloadPromise
 const backup=await (await import('node:fs/promises')).readFile(await download.path()!)
 expect(JSON.parse(backup.toString()).reviewQuestionLimit).toBe(3)
 await page.getByLabel('확인을 위해 ‘삭제’를 입력해 주세요.').fill('삭제')
 await page.getByRole('button',{name:'현재 저장소 데이터 삭제'}).click()
 await expect(limit).toHaveValue('5')
 await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup})
 await expect(page.getByText('현재 저장소의 데이터를 교체')).toBeVisible()
 await page.getByRole('button',{name:'교체하여 가져오기'}).click()
 await expect(page.getByText('백업을 가져왔어요.')).toBeVisible()
 await expect(limit).toHaveValue('3')
 await page.reload()
 await expect(limit).toHaveValue('3')
})
