# SPEC-0001 â€” Configuration Manager

**Product:** cerebro CLI<br />
**Status:** Draft<br />
**Date:** 2026-03-29<br />
**Area:** core<br />
**Depends on:** `@cowboylogic/cerebro-schema` (ToolId, ArtifactType, Scope)<br />
**Consumed by:** [SPEC-0004](SPEC-0004-session.md) (Session), [SPEC-0006](SPEC-0006-installer.md) (Installer), all TUI/CLI/MCP modes<br />

---

## Overview

Manages Cerebro's user configuration file at `~/.config/cerebro/config.yaml`. On first run, the file is created by copying bundled defaults. On subsequent runs, the user's file is loaded and merged with bundled defaults so that any paths not explicitly overridden resolve to the current defaults. The user's file is never modified by Cerebro after the first-run creation.

---

## Scope

**In scope:**<br />
- Locating, creating, loading, and saving `config.yaml`
- Merging user overrides with bundled defaults
- Resolving install paths for a given tool + artifact type + scope combination
- Providing the structured config object to the rest of the application

**Out of scope:**<br />
- Validating source URLs (that is the GitHub module's responsibility)
- Reading or writing the install manifest ([SPEC-0002](SPEC-0002-manifest.md))
- Session-level state ([SPEC-0004](SPEC-0004-session.md))

---

## Configuration File Structure

```yaml
# ~/.config/cerebro/config.yaml

defaults:
  target: claude-code       # ToolId â€” pre-selected target for TUI sessions
  scope: workspace          # Scope â€” pre-selected scope for TUI sessions

sources:
  - name: anthropic-skills
    url: https://github.com/anthropics/skills
    enabled: true
    trusted: false
  - name: awesome-copilot
    url: https://github.com/github/awesome-copilot
    enabled: true
    trusted: false
  # user-added sources appear here

targets:
  # Only overrides from bundled defaults are written here.
  # If a key is absent, the bundled default for that path is used.
  # Example override:
  # vscode-copilot:
  #   skill:
  #     workspace: .vscode/skills
```

---

## Bundled Default Install Paths

These values ship with Cerebro and are used when no user override exists.

| Tool | Artifact Type | Workspace | User |
|------|--------------|-----------|------|
| `agents` | `skill` | `.agents/skills` | `~/.agents/skills` |
| `agents` | `instruction` | `.agents/prompts` | `~/.agents/prompts` |
| `claude-code` | `skill` | `.claude/commands` | `~/.claude/commands` |
| `claude-code` | `instruction` | `.claude/rules` | `~/.claude/rules` |
| `copilot` | `skill` | `.github/skills` | `~/.copilot/skills` |
| `copilot` | `instruction` | `.github/instructions` | `~/.copilot/instructions` |

---

## Public Interface

```typescript
import type { ToolId, ArtifactType, Scope } from '@cowboylogic/cerebro-schema';

export interface SourceEntry {
  /** Display name for this source. */
  name: string;
  /** Full GitHub repository URL. Example: 'https://github.com/anthropics/skills' */
  url: string;
  /** Whether this source appears in the TUI source list. */
  enabled: boolean;
  /** Whether the user has acknowledged the trust warning for this source. */
  trusted: boolean;
}

export interface TargetPathEntry {
  workspace: string;
  user: string;
}

export interface CerebroConfig {
  defaults: {
    target?: ToolId;
    scope?: Scope;
  };
  sources: SourceEntry[];
  /**
   * Nested overrides: targets[toolId][artifactType] = { workspace, user }
   * Keys present here override the bundled defaults for that combination.
   */
  targets: Partial<Record<ToolId, Partial<Record<ArtifactType, Partial<TargetPathEntry>>>>>;
}

/**
 * Load config from ~/.config/cerebro/config.yaml.
 * Creates the file from bundled defaults if it does not exist.
 * Merges user file with bundled defaults (user overrides win).
 */
export function loadConfig(): CerebroConfig;

/**
 * Persist the given config to ~/.config/cerebro/config.yaml.
 * Called when the user adds a source, persists session defaults, or trusts a repo.
 */
export function saveConfig(config: CerebroConfig): void;

/**
 * Resolve the absolute install base path for a given tool + artifact type + scope.
 * Checks user overrides first; falls back to bundled defaults.
 * Expands '~' to the user's home directory.
 * Returns an absolute path.
 */
export function resolveInstallBase(
  config: CerebroConfig,
  tool: ToolId,
  type: ArtifactType,
  scope: Scope
): string;

/**
 * Trust a source: set trusted: true for the matching source entry and persist.
 */
export function trustSource(config: CerebroConfig, url: string): CerebroConfig;

/**
 * Add a new source entry and persist. Does nothing if the URL already exists.
 */
export function addSource(config: CerebroConfig, entry: SourceEntry): CerebroConfig;
```

---

## Requirements

| ID | Keyword | Requirement |
|----|---------|-------------|
| CFG-REQ-0001 | MUST | The config file MUST be located at `~/.config/cerebro/config.yaml` on all platforms. |
| CFG-REQ-0002 | MUST | On first run (file absent), Cerebro MUST create the config directory and file from bundled defaults before any other operation reads the config. |
| CFG-REQ-0003 | MUST NOT | Cerebro MUST NOT modify the user's config file except when: (a) first-run creation, (b) `saveConfig()` is explicitly called by the application. |
| CFG-REQ-0004 | MUST | `loadConfig()` MUST deep-merge the user file with bundled defaults. User-supplied values override defaults; absent user keys fall back to defaults. |
| CFG-REQ-0005 | MUST | `resolveInstallBase()` MUST expand `~` to the user's home directory and return an absolute path. |
| CFG-REQ-0006 | MUST | `resolveInstallBase()` MUST check user `targets` overrides before falling back to bundled defaults. |
| CFG-REQ-0007 | MUST | The two default sources (`anthropics/skills`, `github/awesome-copilot`) MUST be present in the bundled defaults and written on first-run creation. |
| CFG-REQ-0008 | MUST | `trustSource()` MUST set `trusted: true` on the matching source entry and call `saveConfig()`. If no matching source is found, it MUST throw. |
| CFG-REQ-0009 | MUST | `addSource()` MUST NOT add a duplicate URL. If the URL already exists, it MUST return the config unchanged without saving. |
| CFG-REQ-0010 | MUST | The config file MUST be valid YAML. A parse error in the user's file MUST be surfaced as a descriptive error; Cerebro MUST NOT silently fall back to defaults on a corrupt file. |
| CFG-REQ-0011 | SHOULD | `saveConfig()` SHOULD write the file atomically (write to a temp file, then rename) to prevent data loss on interrupted writes. |
| CFG-REQ-0012 | MAY | If `resolveInstallBase()` is called with a tool+type combination not present in either user overrides or bundled defaults, it MAY throw a descriptive error identifying the unsupported combination. |

---

## Error Cases

| Condition | Error | User-visible message |
|-----------|-------|----------------------|
| Config file exists but is not valid YAML | `ConfigParseError` | `Config file at ~/.config/cerebro/config.yaml could not be parsed. Please check for syntax errors or delete the file to reset to defaults.` |
| Config directory cannot be created (permissions) | `ConfigWriteError` | `Unable to create config directory at ~/.config/cerebro/. Check directory permissions.` |
| `trustSource()` called with unknown URL | `SourceNotFoundError` | (internal â€” not user-visible directly) |

---

## Notes

- The `targets` override structure in the config file only needs to contain keys the user has explicitly changed. The YAML does not need to enumerate every tool/type/scope combination â€” absent keys resolve to bundled defaults at runtime.
- `~` expansion uses `os.homedir()` from Node's `node:os` module; it is not shell-expanded.
- The bundled defaults are a TypeScript constant (not a bundled YAML file) to avoid file-path issues with packaged distributions.
