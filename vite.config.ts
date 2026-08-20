import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url))
    }
  },
  root: 'frontend',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 1420,
    strictPort: true
  }
})
