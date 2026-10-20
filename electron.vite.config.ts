import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Every package is a devDependency, so all of it is bundled and the packaged app ships only out/.
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@huggingface/transformers'] }
  }
})
