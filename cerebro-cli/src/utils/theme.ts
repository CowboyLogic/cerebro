import chalk from 'chalk';

export const theme = {
  brand: chalk.hex('#7C3AED'),
  brandBold: chalk.hex('#7C3AED').bold,
  success: chalk.hex('#10B981'),
  warning: chalk.hex('#F59E0B'),
  error: chalk.hex('#EF4444'),
  info: chalk.hex('#3B82F6'),
  dim: chalk.dim,
  bold: chalk.bold,
  muted: chalk.hex('#6B7280'),
  highlight: chalk.hex('#8B5CF6'),
  white: chalk.white,
  cyan: chalk.hex('#06B6D4'),
  accent: chalk.hex('#EC4899'),
};

export const icons = {
  check: theme.success('✓'),
  cross: theme.error('✗'),
  arrow: theme.brand('›'),
  dot: theme.muted('·'),
  star: theme.warning('★'),
  package: '📦',
  rocket: '🚀',
  gear: '⚙️',
  folder: '📁',
  plug: '🔌',
  globe: '🌐',
  shield: '🛡️',
  sparkles: '✨',
  diamond: theme.brand('◈'),
  pulse: theme.accent('◉'),
};

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// ANSI Shadow ASCII art glyphs (6 rows each, fixed width)
const ART: Record<string, string[]> = {
  C: [
    ' ██████╗ ',
    '██╔════╝ ',
    '██║      ',
    '██║      ',
    '╚██████╗ ',
    ' ╚═════╝ ',
  ],
  E: [
    '███████╗',
    '██╔════╝',
    '█████╗  ',
    '██╔══╝  ',
    '███████╗',
    '╚══════╝',
  ],
  R: [
    '██████╗ ',
    '██╔══██╗',
    '██████╔╝',
    '██╔══██╗',
    '██║  ██║',
    '╚═╝  ╚═╝',
  ],
  B: [
    '██████╗ ',
    '██╔══██╗',
    '██████╔╝',
    '██╔══██╗',
    '██████╔╝',
    '╚═════╝ ',
  ],
  O: [
    ' ██████╗ ',
    '██╔═══██╗',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
};

// Purple → indigo → cyan gradient across the 7 letters of CEREBRO
const ART_COLORS = [
  chalk.hex('#7C3AED').bold, // C
  chalk.hex('#6366F1').bold, // E
  chalk.hex('#3B82F6').bold, // R
  chalk.hex('#0EA5E9').bold, // E
  chalk.hex('#0891B2').bold, // B
  chalk.hex('#06B6D4').bold, // R
  chalk.hex('#22D3EE').bold, // O
];

export function banner(): string {
  const word = ['C', 'E', 'R', 'E', 'B', 'R', 'O'];
  const indent = '   ';

  // Build each of the 6 art rows by concatenating styled glyphs
  const artLines = Array.from({ length: 6 }, (_, row) =>
    indent + word.map((ch, i) => ART_COLORS[i](ART[ch][row])).join('')
  );

  // Tagline — must contain the string "Cerebro" to satisfy the test assertion
  const tag = theme.muted('─'.repeat(58));
  const sub =
    '   ' +
    theme.brandBold('Cerebro') +
    theme.muted('  ·  Install AI skills, agents & prompts into your favorite IDE  ·  v0.1.0');

  return ['', ...artLines, '   ' + tag, sub, ''].join('\n');
}

export function sectionHeader(title: string): string {
  return `\n  ${theme.brandBold(title)}\n  ${theme.brand('─'.repeat(title.length + 2))}\n`;
}

export function resultBox(title: string, items: string[]): string {
  const maxLen = Math.max(title.length, ...items.map(i => stripAnsi(i).length));
  const width = maxLen + 4;
  const top = theme.success('  ┌' + '─'.repeat(width) + '┐');
  const titleLine = theme.success('  │') + ' ' + theme.success.bold(title.padEnd(width - 1)) + theme.success('│');
  const sep = theme.success('  ├' + '─'.repeat(width) + '┤');
  const bottom = theme.success('  └' + '─'.repeat(width) + '┘');
  const body = items.map(item => {
    const stripped = stripAnsi(item);
    const pad = width - 1 - stripped.length;
    return theme.success('  │') + ' ' + item + ' '.repeat(Math.max(0, pad)) + theme.success('│');
  });
  return [top, titleLine, sep, ...body, bottom].join('\n');
}

export function stepBadge(current: number, total: number): string {
  return theme.muted(`[${current}/${total}]`);
}

export function tagLabel(tag: string): string {
  return theme.highlight(`[${tag}]`);
}

export function statsLine(counts: Array<{ label: string; value: number; color?: (s: string) => string }>): string {
  const parts = counts.map(({ label, value, color }) => {
    const numStr = color ? color(String(value)) : theme.bold(String(value));
    return `${numStr} ${theme.muted(label)}`;
  });
  return '  ' + parts.join(theme.muted('  ·  '));
}
