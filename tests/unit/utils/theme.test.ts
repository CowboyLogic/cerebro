import { describe, it, expect } from 'vitest';

// Colors are disabled via NO_COLOR=1 in setup.ts so we can assert plain text
describe('banner', () => {
  it('returns a multi-line string', async () => {
    const { banner } = await import('../../../src/utils/theme.js');
    const result = banner();
    expect(result.split('\n').length).toBeGreaterThan(3);
  });

  it('contains "Cerebro"', async () => {
    const { banner } = await import('../../../src/utils/theme.js');
    expect(banner()).toContain('Cerebro');
  });
});

describe('sectionHeader', () => {
  it('contains the provided title', async () => {
    const { sectionHeader } = await import('../../../src/utils/theme.js');
    expect(sectionHeader('My Section')).toContain('My Section');
  });

  it('returns a string with newlines', async () => {
    const { sectionHeader } = await import('../../../src/utils/theme.js');
    expect(sectionHeader('Test').includes('\n')).toBe(true);
  });
});

describe('resultBox', () => {
  it('contains the provided title', async () => {
    const { resultBox } = await import('../../../src/utils/theme.js');
    expect(resultBox('My Title', [])).toContain('My Title');
  });

  it('contains each provided item', async () => {
    const { resultBox } = await import('../../../src/utils/theme.js');
    const result = resultBox('Title', ['Item One', 'Item Two']);
    expect(result).toContain('Item One');
    expect(result).toContain('Item Two');
  });

  it('works with zero items', async () => {
    const { resultBox } = await import('../../../src/utils/theme.js');
    expect(() => resultBox('Empty Box', [])).not.toThrow();
  });
});
