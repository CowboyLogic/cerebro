/**
 * SPEC-0007 / CLI-0002 — TUI: screen components.
 *
 * CLI-0002: Components are pure render functions — no useInput, no useState
 * for cursor or navigation. All state flows in through props from app.tsx.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { SourceEntry } from '../core/config.js';
import type { Artifact, ArtifactType, ToolId, Scope } from '@cowboylogic/cerebro-schema';
import type { ArtifactStatus } from '../core/manifest.js';
import { MVP_TARGETS, SCOPES, PAGE_SIZE } from './transitions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: ArtifactStatus): { text: string; color: string } | null {
  switch (status) {
    case 'installed': return { text: '(Installed) ✓', color: 'green' };
    case 'conflict':  return { text: '(Conflict) ✗',  color: 'red' };
    case 'exists':    return { text: '(Exists) ⚠',    color: 'yellow' };
    default:          return null;
  }
}

// ---------------------------------------------------------------------------
// 1. RepoList
// ---------------------------------------------------------------------------

export interface RepoListProps {
  sources: SourceEntry[];
  cursor: number;
  error?: string | null;
}

export function RepoList({ sources, cursor, error }: RepoListProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Select a source repository:</Text>
      <Box flexDirection="column" marginTop={1}>
        {sources.map((s, i) => (
          <Text key={s.url} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '▶  ' : '   '}{s.name}
          </Text>
        ))}
        <Text dimColor>{'   ──────────────────────'}</Text>
        <Text color={cursor === sources.length ? 'cyan' : undefined}>
          {cursor === sources.length ? '▶  ' : '   '}{'+ Add custom source…'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Escape exit</Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">✗  {error}</Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 2. TrustWarning
// ---------------------------------------------------------------------------

export interface TrustWarningProps {
  sourceUrl: string;
  cursor: number;
}

export function TrustWarning({ sourceUrl, cursor }: TrustWarningProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="yellow" bold>⚠  Trust Warning</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>You are about to browse artifacts from:</Text>
        <Text color="cyan">{sourceUrl}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Only install artifacts from sources you trust.</Text>
          <Text>Malicious artifacts could modify your AI tool</Text>
          <Text>configuration in harmful ways.</Text>
        </Box>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color={cursor === 0 ? 'green' : undefined}>
          {cursor === 0 ? '[ Trust this source and continue ]' : '  Trust this source and continue  '}
        </Text>
        <Text color={cursor === 1 ? 'red' : undefined}>
          {cursor === 1 ? '[ Cancel ]' : '  Cancel  '}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → to switch · Enter to confirm · Escape to cancel</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 3. TargetSelect
// ---------------------------------------------------------------------------

export interface TargetSelectProps {
  cursor: number;
}

export function TargetSelect({ cursor }: TargetSelectProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Install artifacts for:</Text>
      <Box flexDirection="column" marginTop={1}>
        {MVP_TARGETS.map((t, i) => (
          <Text key={t.id} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '▶  ' : '   '}{t.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Escape back</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 4. ScopeSelect
// ---------------------------------------------------------------------------

export interface ScopeSelectProps {
  cursor: number;
}

export function ScopeSelect({ cursor }: ScopeSelectProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Install scope:</Text>
      <Box flexDirection="column" marginTop={1}>
        {SCOPES.map((s, i) => (
          <Text key={s.id} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '▶  ' : '   '}{s.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Escape back</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 5. ScopePersist
// ---------------------------------------------------------------------------

export interface ScopePersistProps {
  cursor: number; // 0 = Yes, 1 = No
}

export function ScopePersist({ cursor }: ScopePersistProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Save as default for future sessions?</Text>
      <Box marginTop={1} gap={2}>
        <Text color={cursor === 0 ? 'green' : undefined}>
          {cursor === 0 ? '[ Yes ]' : '  Yes  '}
        </Text>
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '[ No ]' : '  No  '}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → to switch · Enter to confirm · Escape to skip</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 6. TypeMenu
// ---------------------------------------------------------------------------

export interface TypeMenuProps {
  sourceName: string;
  target: ToolId;
  scope: Scope;
  types: ArtifactType[];
  counts: Record<string, number>;
  cursor: number;
  error: string | null;
}

export function TypeMenu({ sourceName, target, scope, types, counts, cursor, error }: TypeMenuProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text dimColor>{sourceName}  ·  {target}  ·  {scope}</Text>
      <Box marginTop={1}>
        <Text bold>Browse by type:</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {types.length === 0 && (
          <Text dimColor>No artifact types found for this source.</Text>
        )}
        {types.map((t, i) => (
          <Text key={t} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '▶  ' : '   '}{t.padEnd(18)}{`(${counts[t]} available)`}
          </Text>
        ))}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Escape back</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 7. ItemList + Filter
// ---------------------------------------------------------------------------

export interface ItemListProps {
  sourceName: string;
  selectedType: ArtifactType;
  target: ToolId;
  scope: Scope;
  artifacts: Artifact[];       // already filtered to selectedType
  getStatus: (a: Artifact) => ArtifactStatus;
  filter: string;
  cursor: number;
  page: number;
  installing: string | null;
  installError: string | null;
}

export function ItemList({
  sourceName, selectedType, target, scope,
  artifacts, getStatus, filter, cursor, page,
  installing, installError,
}: ItemListProps) {
  // TUI-REQ-0010: case-insensitive name match
  const filtered = filter
    ? artifacts.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
    : artifacts;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text dimColor>
        {sourceName}  ·  {selectedType}  ·  {target}  ·  {scope}
      </Text>
      <Box marginTop={1}>
        <Text bold>{'Filter: '}</Text>
        <Text color="cyan">[{filter}_{'_'.repeat(Math.max(0, 20 - filter.length))}]</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {pageItems.length === 0 && <Text dimColor>  No artifacts match.</Text>}
        {pageItems.map((a, i) => {
          const status = getStatus(a);
          const badge = statusBadge(status);
          const selected = i === cursor;
          return (
            <Box key={a.id}>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '▶  ' : '   '}{a.name.padEnd(38)}
              </Text>
              {badge && (
                <Text color={badge.color as 'green' | 'red' | 'yellow'}>
                  {badge.text}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      {installing && (
        <Box marginTop={1}>
          <Text color="cyan">Installing {installing}…</Text>
        </Box>
      )}
      {installError && (
        <Box marginTop={1}>
          <Text color="red">{installError}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          Page {page + 1} of {pageCount}  ·  {filtered.length} of {artifacts.length} items
          {'  ·  Space: next page  ·  Enter: install  ·  Escape: back'}
        </Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 8. OverwriteConfirm
// ---------------------------------------------------------------------------

export interface OverwriteConfirmProps {
  artifact: Artifact;
  installPath: string;
  status: ArtifactStatus;
  cursor: number; // 0 = Yes, 1 = No
}

export function OverwriteConfirm({ artifact, installPath, status, cursor }: OverwriteConfirmProps) {
  const badge = statusBadge(status);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text color="yellow" bold>⚠  Already exists</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text><Text bold>{artifact.name}</Text> is already present at:</Text>
        <Text color="cyan">{installPath}</Text>
        {badge && (
          <Box marginTop={1}>
            <Text>Status: <Text color={badge.color as 'green' | 'red' | 'yellow'}>{badge.text}</Text></Text>
          </Box>
        )}
      </Box>
      <Box marginTop={1}>
        <Text bold>Overwrite?  </Text>
        <Text color={cursor === 0 ? 'green' : undefined}>
          {cursor === 0 ? '[ Yes ]' : '  Yes  '}
        </Text>
        <Text>{'   '}</Text>
        <Text color={cursor === 1 ? 'red' : undefined}>
          {cursor === 1 ? '[ No ]' : '  No  '}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → to switch · Enter to confirm · Escape to cancel</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 9. AddSource
// ---------------------------------------------------------------------------

export interface AddSourceProps {
  url: string;
  formatError: string | null;
  validating: boolean;
  error: string | null;
}

export function AddSource({ url, formatError, validating, error }: AddSourceProps) {
  const displayError = formatError ?? error;

  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Add custom source</Text>
      <Box marginTop={1}>
        <Text>Enter a public GitHub repository URL:</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{'> '}{url}{'_'}</Text>
      </Box>
      {displayError && (
        <Box marginTop={1}>
          <Text color="red">{displayError}</Text>
        </Box>
      )}
      {validating && (
        <Box marginTop={1}>
          <Text color="cyan">Validating…</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Enter to validate · Escape to cancel</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 10. AddSourceSave
// ---------------------------------------------------------------------------

export interface AddSourceSaveProps {
  cursor: number; // 0 = Yes, 1 = No
}

export function AddSourceSave({ cursor }: AddSourceSaveProps) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text bold>Save this source for future sessions?</Text>
      <Box marginTop={1} gap={2}>
        <Text color={cursor === 0 ? 'green' : undefined}>
          {cursor === 0 ? '[ Yes ]' : '  Yes  '}
        </Text>
        <Text color={cursor === 1 ? 'cyan' : undefined}>
          {cursor === 1 ? '[ No ]' : '  No  '}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → to switch · Enter to confirm · Escape to cancel</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Loading / Error display
// ---------------------------------------------------------------------------

export function Loading({ message }: { message: string }) {
  return (
    <Box paddingLeft={2} paddingTop={1}>
      <Text color="cyan">⟳  {message}</Text>
    </Box>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <Box paddingLeft={2} paddingTop={1}>
      <Text color="red">✗  {message}</Text>
    </Box>
  );
}
