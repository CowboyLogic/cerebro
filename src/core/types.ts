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

export interface RepoManifest {
  name: string;
  description?: string;
  components: Component[];
}

export const DEFAULT_REPOS: RepoSource[] = [
  { owner: 'github', repo: 'awesome-copilot' },
  { owner: 'anthropics', repo: 'skills' },
];
