import { defineConfig } from 'vitest/config'

// Own config so vitest does not pick up the frontend's ../vite.config.ts (node polyfills).
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'], fileParallelism: false },
})
