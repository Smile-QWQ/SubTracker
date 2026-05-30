import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@subtracker/shared/locale-core': path.resolve(__dirname, '../../packages/shared/src/locale-core.ts'),
      '@subtracker/shared/i18n': path.resolve(__dirname, '../../packages/shared/src/i18n.ts'),
      '@subtracker/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
