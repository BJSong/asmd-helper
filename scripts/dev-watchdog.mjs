import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

const port = Number(process.env.WATCHDOG_PORT || 3000)
const address = `http://127.0.0.1:${port}/`
const nuxt = new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url)
let child
let stopping = false
let failures = 0
let restarts = 0
let lastReady = 0
let resolveStop
const stopPromise = new Promise(resolve => { resolveStop = resolve })

async function stopChild(signal = 'SIGTERM') {
  if (!child?.pid) return
  const current = child
  current.kill(signal)
  await Promise.race([new Promise(resolve => current.once('exit', resolve)), wait(5000)])
  if (current.exitCode === null && current.signalCode === null) current.kill('SIGKILL')
}

async function healthCheck() {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(4000), redirect: 'manual' })
    if (response.status < 500) { failures = 0; lastReady = Date.now(); return true }
  } catch {}
  if (Date.now() - lastReady < 60_000) return true
  failures++
  return failures < 3
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  stopping = true
  resolveStop?.()
  await stopChild(signal)
})

while (!stopping) {
  console.log(`[watchdog] starting Nuxt dev server on ${address}`)
  failures = 0
  lastReady = Date.now()
  child = spawn(process.execPath, [nuxt.pathname, 'dev', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'inherit', env: process.env })
  let exited = false
  child.once('exit', (code, signal) => {
    exited = true
    console.log(`[watchdog] Nuxt exited (code ${code ?? 'none'}, signal ${signal ?? 'none'})`)
  })
  while (!stopping && !exited) {
    const healthTimer = new AbortController()
    await Promise.race([wait(15_000, undefined, { signal: healthTimer.signal }).catch(() => {}), stopPromise])
    healthTimer.abort()
    if (stopping || exited) break
    if (!await healthCheck()) {
      console.error('[watchdog] no healthy response after three checks; restarting Nuxt')
      await stopChild()
      break
    }
  }
  if (stopping) break
  restarts++
  const backoff = Math.min(15_000, 1000 * 2 ** Math.min(restarts - 1, 4))
  console.log(`[watchdog] restart ${restarts} in ${backoff / 1000}s`)
  await wait(backoff)
}
console.log('[watchdog] stopped')
