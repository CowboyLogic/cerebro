import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    alias: {
      // Resolve .js imports in ESM TypeScript source to .ts files
      '(.+)\\.js$': '$1',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
      },
      reporter: ['text', 'lcov', 'html'],
    },
  },
});
