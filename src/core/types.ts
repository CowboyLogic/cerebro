import type {
  ArtifactType,
  ArtifactFile,
  CompatibilityEntry,
  ArtifactSet,
  CerebroCatalog,
  Artifact,
  ToolId,
  Scope,
} from '@cowboylogic/cerebro-schema';

// Re-export all schema types for use throughout the CLI
export type {
  ArtifactType,
  ArtifactFile,
  CompatibilityEntry,
  ArtifactSet,
  CerebroCatalog,
  Artifact,
  ToolId,
  Scope,
};

// ── CLI-specific types ────────────────────────────────────────────────────────

export interface RepoSource {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export interface InstallOptions {
  artifact: Artifact;
  tool: ToolId;
  scope: Scope;
  /** 'owner/repo' string — used to fetch source files from GitHub */
  sourceRepo: string;
  workspaceRoot?: string;
  dryRun?: boolean;
}

export interface InstallResult {
  success: boolean;
  artifact: Artifact;
  tool: ToolId;
  scope: Scope;
  installedFiles: string[];
  errors: string[];
}

export const IDE_DISPLAY_NAMES: Record<ToolId, string> = {
  'claude-code':    'Claude Code',
  'opencode':       'Opencode',
  'copilot':        'GitHub Copilot',
  'visual-studio':  'Visual Studio',
  'intellij':       'IntelliJ IDEA',
};

export const DEFAULT_REPOS: RepoSource[] = [
  { owner: 'github',      repo: 'awesome-copilot' },
  { owner: 'anthropics',  repo: 'skills' },
];
