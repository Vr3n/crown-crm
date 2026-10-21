import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['node_modules/**', 'out/**', 'tests/renderer/**'],
          testTimeout: 15000,
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/main/**/*.ts'],
            exclude: ['src/main/index.ts', 'src/main/ipc/**', 'src/main/db.ts']
          }
        }
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            '@renderer': resolve('src/renderer/src'),
            '@': resolve('src/renderer/src')
          }
        },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
          exclude: ['node_modules/**', 'out/**'],
          setupFiles: ['tests/renderer/setup.ts'],
          testTimeout: 15000
        }
      }
    ]
  }
})
