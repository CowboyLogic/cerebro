#!/usr/bin/env node
/**
 * Cerebro workspace bootstrap script
 *
 * Clones all Cerebro suite repositories into the correct layout and installs
 * dependencies. Run this once to set up a fresh development environment.
 *
 * Usage:
 *   node bootstrap.js [target-directory]
 *
 * The optional target-directory defaults to ./cerebro in the current working
 * directory. All six repos will be cloned as subdirectories inside it.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ORG = 'CowboyLogic';

const REPOS = [
  { name: 'cerebro',              hasPackage: true  },
  { name: 'cerebro-schema',       hasPackage: true  },
  { name: 'cerebro-vscode-ext',   hasPackage: true  },
  { name: 'cerebro-vs-ext',       hasPackage: false },
  { name: 'cerebro-intellij-ext', hasPackage: false },
  { name: 'cerebro-eclipse-ext',  hasPackage: false },
];

const MIN_NODE_MAJOR = 20;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';

function ok(msg)   { console.log(`  ${GREEN}✔${RESET}  ${msg}`); }
function skip(msg) { console.log(`  ${YELLOW}–${RESET}  ${DIM}${msg}${RESET}`); }
function fail(msg) { console.error(`  ${RED}✖${RESET}  ${msg}`); }
function info(msg) { console.log(`  ${CYAN}i${RESET}  ${msg}`); }
function step(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', ...opts });
}

function runQuiet(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', ...opts }).toString().trim();
}

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------

function checkPrerequisites() {
  step('Checking prerequisites...');

  // Node.js version
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    fail(`Node.js ${MIN_NODE_MAJOR}+ required. Current: ${process.version}`);
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);

  // git
  try {
    const gitVersion = runQuiet('git --version');
    ok(gitVersion);
  } catch {
    fail('git is required but was not found. Install git and try again.');
    process.exit(1);
  }

  // gh CLI (optional but recommended)
  try {
    const ghVersion = runQuiet('gh --version').split('\n')[0];
    ok(`${ghVersion} ${DIM}(optional — used for auth)${RESET}`);
  } catch {
    skip('GitHub CLI (gh) not found — not required, but useful for authentication');
  }
}

// ---------------------------------------------------------------------------
// Clone repositories
// ---------------------------------------------------------------------------

function cloneRepos(workspaceDir) {
  step('Cloning repositories...');
  fs.mkdirSync(workspaceDir, { recursive: true });

  for (const repo of REPOS) {
    const repoPath = path.join(workspaceDir, repo.name);

    if (fs.existsSync(repoPath)) {
      skip(`${repo.name} — already exists, skipping`);
      continue;
    }

    const url = `https://github.com/${ORG}/${repo.name}.git`;
    console.log(`  Cloning ${CYAN}${repo.name}${RESET}...`);
    try {
      run(`git clone ${url} "${repoPath}"`, { silent: false });
      ok(`${repo.name}`);
    } catch {
      fail(`Failed to clone ${repo.name}. Check your GitHub access and try again.`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Install dependencies
// ---------------------------------------------------------------------------

function installDependencies(workspaceDir) {
  step('Installing dependencies...');

  const packageRepos = REPOS.filter(r => r.hasPackage);

  // Install cerebro-schema first — other packages depend on it via file: link
  const ordered = [
    ...packageRepos.filter(r => r.name === 'cerebro-schema'),
    ...packageRepos.filter(r => r.name !== 'cerebro-schema'),
  ];

  for (const repo of ordered) {
    const repoPath = path.join(workspaceDir, repo.name);
    const pkgPath  = path.join(repoPath, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      skip(`${repo.name} — no package.json, skipping`);
      continue;
    }

    console.log(`  Installing ${CYAN}${repo.name}${RESET}...`);
    try {
      run('npm install', { cwd: repoPath, silent: false });
      ok(`${repo.name}`);
    } catch {
      fail(`npm install failed in ${repo.name}.`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Verify workspace
// ---------------------------------------------------------------------------

function verifyWorkspace(workspaceDir) {
  step('Verifying workspace...');
  let allGood = true;

  for (const repo of REPOS) {
    const repoPath = path.join(workspaceDir, repo.name);
    if (fs.existsSync(path.join(repoPath, '.git'))) {
      ok(repo.name);
    } else {
      fail(`${repo.name} — missing or not a git repo`);
      allGood = false;
    }
  }

  return allGood;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  console.log(`\n${BOLD}Cerebro workspace bootstrap${RESET}`);
  console.log(DIM + 'https://github.com/CowboyLogic/cerebro' + RESET + '\n');

  const targetArg    = process.argv[2];
  const workspaceDir = targetArg
    ? path.resolve(targetArg)
    : path.join(process.cwd(), 'cerebro');

  info(`Workspace directory: ${CYAN}${workspaceDir}${RESET}`);

  checkPrerequisites();
  cloneRepos(workspaceDir);
  installDependencies(workspaceDir);
  const ok_ = verifyWorkspace(workspaceDir);

  if (ok_) {
    console.log(`\n${GREEN}${BOLD}Workspace ready.${RESET}`);
    console.log(`\n  Next steps:`);
    console.log(`  ${DIM}1. cd ${workspaceDir}/cerebro${RESET}`);
    console.log(`  ${DIM}2. npm start         # launch the interactive CLI${RESET}`);
    console.log(`  ${DIM}3. See CONTRIBUTING.md for the full development workflow${RESET}\n`);
  } else {
    console.log(`\n${YELLOW}${BOLD}Bootstrap completed with warnings. See above.${RESET}\n`);
  }
}

main();
