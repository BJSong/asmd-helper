import { spawn } from 'node:child_process'
const nuxt = new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url)
const child = spawn(process.execPath, [nuxt.pathname, 'dev', '--host', '127.0.0.1', '--port', '3030'], { stdio: 'inherit', env: process.env })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
child.once('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
