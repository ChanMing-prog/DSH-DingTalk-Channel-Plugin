/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [],
    // JSX transform: 让 vitest 能跑 .tsx 测试
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  },
})