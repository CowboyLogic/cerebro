import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    alias: {
      // Resolve .js imports in ESM TypeScript source to .ts files
      '(.+)\\.js$': '$1',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/ui/interactive.ts'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
      },
      reporter: ['text', 'lcov', 'html'],
    },
  },
});
