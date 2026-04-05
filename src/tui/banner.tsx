/**
 * SPEC-0007 — <Banner> component (TUI-REQ-0020 through TUI-REQ-0024)
 *
 * Two-pane layout: coloured ASCII art on the left, info panel on the right.
 * Replaces the former raw-ANSI banner() string function.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../core/session.js';
import { VERSION } from '../core/provider.js';

// ---------------------------------------------------------------------------
// Art data (TUI-REQ-0021)
// ---------------------------------------------------------------------------

const ART: Record<string, string[]> = {
  C: [' ██████╗ ', '██╔════╝ ', '██║      ', '██║      ', '╚██████╗ ', ' ╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
};

const WORD = ['C', 'E', 'R', 'E', 'B', 'R', 'O'] as const;

/** Hex colour for each glyph column — deep violet (#7C3AED) → cyan (#22D3EE). */
const GLYPH_COLORS: string[] = [
  '#7C3AED', // C
  '#6366F1', // E
  '#3B82F6', // R
  '#0EA5E9', // E
  '#0891B2', // B
  '#06B6D4', // R
  '#22D3EE', // O
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AuthSource = 'GITHUB_TOKEN' | 'GH_TOKEN' | 'gh CLI' | 'none';

export interface BannerProps {
  session: Session;
  /** Human-readable label for the active GitHub auth source. Never a token value. */
  authSource: AuthSource;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Banner({ session, authSource }: BannerProps) {
  const enabledCount = session.config.sources.filter(s => s.enabled).length;
  const { target, scope } = session.config.defaults;
  const defaultText = target && scope ? `${target} · ${scope}` : 'not set';

  return (
    <Box flexDirection="row" borderStyle="double" borderColor="#7C3AED">
      {/* Left pane — TUI-REQ-0021: 6 rows of coloured ASCII art */}
      <Box flexDirection="column">
        {Array.from({ length: 6 }, (_, row) => (
          <Box key={row} flexDirection="row">
            {WORD.map((ch, i) => (
              <Text key={i} color={GLYPH_COLORS[i]} bold>
                {ART[ch][row]}
              </Text>
            ))}
          </Box>
        ))}
      </Box>

      {/* Right pane — TUI-REQ-0022: 6-line info panel aligned with art rows */}
      <Box flexDirection="column" paddingLeft={2}>
        <Text>Install AI skills {'&'} agents into your IDE</Text>
        <Text>{' '}</Text>
        <Text>{'Version: '}{VERSION}</Text>
        <Text>{'Auth:    '}{authSource}</Text>
        <Text>{'Sources: '}{enabledCount}{' enabled'}</Text>
        <Text>{'Default: '}{defaultText}</Text>
      </Box>
    </Box>
  );
}
