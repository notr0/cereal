import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Bundle the Anthropic SDK into main so the built app runs without node_modules.
  main: { build: { externalizeDeps: { exclude: ['@anthropic-ai/sdk'] } } },
  preload: {},
  renderer: {
    plugins: [react()],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@huggingface/transformers'] }
  }
})
