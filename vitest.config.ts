import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['testes/**/*.test.ts', 'packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false
  }
});
