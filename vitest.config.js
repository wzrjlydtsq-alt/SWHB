import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['node_modules', 'out', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/services/**', 'src/renderer/store/**', 'src/renderer/utils/**']
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  }
})
