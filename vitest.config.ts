import { fileURLToPath, URL } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      globals: true
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./frontend/src', import.meta.url))
      }
    }
  })
)
