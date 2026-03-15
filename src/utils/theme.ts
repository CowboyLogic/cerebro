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
};

export function banner(): string {
  const lines = [
    '',
    theme.brand('  ╔══════════════════════════════════════════════╗'),
    theme.brand('  ║') + theme.brandBold('    AI Artifact Installer                    ') + theme.brand('║'),
    theme.brand('  ║') + theme.muted('    Install skills, agents & prompts          ') + theme.brand('║'),
    theme.brand('  ║') + theme.muted('    into your favorite IDE                    ') + theme.brand('║'),
    theme.brand('  ╚══════════════════════════════════════════════╝'),
    '',
  ];
  return lines.join('\n');
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

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}
