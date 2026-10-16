import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({resolve:{alias:{'#shared':fileURLToPath(new URL('./shared',import.meta.url)),'#domain':fileURLToPath(new URL('./domain',import.meta.url)),'#repositories':fileURLToPath(new URL('./repositories',import.meta.url))}},test:{environment:'node',include:['tests/**/*.test.ts'],restoreMocks:true}})
