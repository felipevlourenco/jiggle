import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Playwright specs live in tests/e2e and must not be picked up here.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: { include: ['src/**/*.test.{ts,tsx}'] }
})
