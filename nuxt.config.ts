import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  buildDir: '.nuxt',
  devtools: { enabled: false },
  alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)), '#domain': fileURLToPath(new URL('./domain', import.meta.url)), '#repositories': fileURLToPath(new URL('./repositories', import.meta.url)) },
  css: ['~/assets/css/main.css', '~/assets/css/playful.css'],
  nitro: { externals: { inline: [/\/shared\//, /\/domain\//, /\/repositories\//] } },
  vite: { plugins: [tailwindcss()] },
  app: { head: { title: 'AFSR Math · 매일 조금씩, 단단한 계산', htmlAttrs: { lang: 'ko' }, meta: [{ name: 'description', content: '나의 속도로 배우는 사칙연산. 매일 학습, 자유 연습, 오답 복습과 학습 기록.' }], link: [{ rel: 'icon', href: '/favicon.svg' }] } },
  runtimeConfig: { cloudEnabled: false, cloudAccessToken: '', supabaseUrl: '', supabaseServiceKey: '' },
  typescript: { strict: true },
})
