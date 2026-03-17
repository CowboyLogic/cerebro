import { beforeEach, afterEach, vi } from 'vitest';

// Disable chalk colors in tests so assertions work on plain text
process.env.FORCE_COLOR = '0';
process.env.NO_COLOR = '1';

// Save and restore env vars around each test to prevent cross-test pollution
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = { ...process.env };
});

afterEach(() => {
  vi.unstubAllEnvs();
  // Restore env
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
});
