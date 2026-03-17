import fs from 'node:fs';
import path from 'node:path';
import { getUserConfigDir } from '../utils/platform.js';
import { RepoSource } from './types.js';
import { parseRepoUrl } from './github.js';

const MAX_CUSTOM_REPOS = 20;
const MAX_FILE_BYTES = 64 * 1024; // 64 KB guard against bloated / malicious files

export interface UserSettings {
  customRepos: RepoSource[];
}

export function getSettingsPath(): string {
  return path.join(getUserConfigDir(), 'cerebro', 'user-settings.json');
}

export function loadSettings(): UserSettings {
  const filePath = getSettingsPath();
  try {
    if (!fs.existsSync(filePath)) return empty();

    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_BYTES) return empty(); // refuse to parse oversized file

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty();

    return {
      customRepos: sanitizeRepos((parsed as Record<string, unknown>).customRepos),
    };
  } catch {
    return empty();
  }
}

export function saveSettings(settings: UserSettings): void {
  const filePath = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    // Non-fatal — silently skip if the filesystem is read-only or permissions are missing
  }
}

/**
 * Adds a custom repo to settings (deduplicates, caps at MAX_CUSTOM_REPOS).
 * Returns the updated settings object and persists it.
 */
export function addCustomRepo(settings: UserSettings, source: RepoSource): UserSettings {
  const already = settings.customRepos.some(
    r => r.owner === source.owner && r.repo === source.repo
  );
  if (already) return settings;

  const updated: UserSettings = {
    ...settings,
    customRepos: [
      { owner: source.owner, repo: source.repo },
      ...settings.customRepos,
    ].slice(0, MAX_CUSTOM_REPOS),
  };
  saveSettings(updated);
  return updated;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function empty(): UserSettings {
  return { customRepos: [] };
}

/**
 * Validates each repo entry through parseRepoUrl (which enforces the GitHub
 * identifier regex) so a hand-edited or tampered settings file can never
 * smuggle malicious owner/repo strings into later path construction.
 */
function sanitizeRepos(raw: unknown): RepoSource[] {
  if (!Array.isArray(raw)) return [];
  const valid: RepoSource[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { owner, repo } = item as Record<string, unknown>;
    if (typeof owner !== 'string' || typeof repo !== 'string') continue;
    try {
      parseRepoUrl(`${owner}/${repo}`);
      valid.push({ owner, repo });
    } catch {
      // Drop invalid entry silently
    }
    if (valid.length >= MAX_CUSTOM_REPOS) break;
  }
  return valid;
}
