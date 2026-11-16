import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The renderer code uses DOMParser and window; happy-dom provides both without Electron.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts']
  }
})
