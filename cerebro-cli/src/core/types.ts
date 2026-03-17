export type ComponentType = 'skill' | 'agent' | 'prompt' | 'instruction' | 'snippet' | 'workflow' | 'unknown';

export type TargetIDE = 'claude-code' | 'opencode' | 'vscode' | 'copilot';

export const IDE_DISPLAY_NAMES: Record<TargetIDE, string> = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'vscode': 'VS Code',
  'copilot': 'Copilot CLI',
};

export type Scope = 'user' | 'workspace';

export interface RepoSource {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export interface Component {
  name: string;
  type: ComponentType;
  description: string;
  path: string;
  files: ComponentFile[];
  source: RepoSource;
  compatibleTargets: TargetIDE[];
  tags?: string[];
}

export interface ComponentFile {
  path: string;
  name: string;
  content?: string;
  size?: number;
}

export interface InstallOptions {
  component: Component;
  target: TargetIDE;
  scope: Scope;
  workspaceRoot?: string;
  dryRun?: boolean;
}

export interface InstallResult {
  success: boolean;
  component: Component;
  target: TargetIDE;
  scope: Scope;
  installedFiles: string[];
  errors: string[];
}

/**
 * A single component entry inside a cerebro.json manifest.
 * Kept separate from Component so the manifest stays a simple,
 * human-writable JSON file with no runtime/internal fields.
 */
export interface ManifestComponent {
  name: string;
  type: ComponentType;
  description?: string;
  /** File paths relative to the repo root — must not start with '..' or '/' */
  files: string[];
  targets: TargetIDE[];
  tags?: string[];
}

/**
 * Schema for the cerebro.json file repos place at their root to provide
 * an authoritative component list (bypasses heuristic discovery entirely).
 */
export interface RepoManifest {
  /** Schema version — currently "1" */
  cerebro: string;
  name?: string;
  description?: string;
  components: ManifestComponent[];
}

export const DEFAULT_REPOS: RepoSource[] = [
  { owner: 'github', repo: 'awesome-copilot' },
  { owner: 'anthropics', repo: 'skills' },
];
