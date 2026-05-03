# Cerebro Suite — Design Brief

**Status:** Living document
**Last updated:** 2026-03-29

---

## Problem Statement

AI coding assistants (Claude Code, GitHub Copilot, Cursor, Windsurf, OpenCode, and dozens of others) are increasingly extensible through skills, instructions, agents, prompts, hooks, and MCP servers. These artifacts are created by individuals and organisations and shared in public repositories — but there is no standard way to discover or install them. Each tool has its own conventions, and every installation is a manual process: find the repo, read the docs, figure out where this tool expects the file, copy it there.

**The result:** Valuable community-created artifacts go undiscovered. Developers who work across multiple AI tools must repeat the process for each one. Teams that want to standardise AI tool configuration have no reliable mechanism to do so. Switching tools means starting over.

---

## Vision

Cerebro is a suite of tools that makes AI artifact discovery and installation as straightforward as a package manager — browse a source repository, select what you want, install it to the right place for your tool of choice.

The suite meets developers where they are: a TUI for interactive exploration, direct CLI commands for scripting and automation, an MCP interface for agent-driven installation, and IDE extensions for those who prefer a GUI. A shared catalog format (`cerebro-catalog.yaml`) gives any repository maintainer a simple way to make their artifacts first-class Cerebro citizens.

---

## Target Users

**Primary:** Individual developers who use one or more AI coding assistants and want to extend them with community artifacts.

**Secondary:** Engineering teams and platform teams who want to curate and distribute a standard set of AI tool configurations across their organisation (internal registries, approved skill sets, standardised agent configurations).

---

## Goals

1. **Universal discovery** — Browse AI artifacts from any public source repository, with or without a `cerebro-catalog.yaml`. Heuristic scanning provides reasonable results for repos that follow common artifact conventions.
2. **Multi-tool support** — Install artifacts to Claude Code, GitHub Copilot, the `.agents` standard, and future tools. The same artifact can be installed to different targets in separate sessions.
3. **Catalog as opt-in standard** — Repository maintainers who publish a `cerebro-catalog.yaml` get precise control over what is available and how it is described. The catalog is encouraged, never required.
4. **Zero lock-in** — Cerebro installs standard files in standard locations. Uninstalling Cerebro doesn't break anything. The installed files work without Cerebro present.
5. **Safe by default** — Installation is non-destructive. Existing files are never silently overwritten. Path traversal and scope escape are prevented at the installer layer regardless of catalog content. Baseline project files (`CLAUDE.md`, `AGENTS.md`, etc.) are off-limits.
6. **Agent-native** — Cerebro exposes an MCP interface (`--mcp`) so AI agents can invoke installation autonomously, without human interaction.

---

## Non-Goals

1. **Runtime management** — Cerebro installs artifacts; it does not manage running agents, API keys, or AI tool processes.
2. **Artifact authoring** — Cerebro does not provide tooling for creating or editing artifacts.
3. **Version pinning (v1)** — Artifacts are fetched from the default branch at install time. The manifest records a SHA for future update detection, but pinning to a specific commit or tag is deferred.
4. **Private repositories (v1)** — User-added sources must be public. Private repository support (with authentication) is a future feature.
5. **Non-GitHub sources (v1)** — The source provider layer is abstracted (`SourceProvider` interface) to support GitLab, Bitbucket, etc. in future releases. Only `GitHubProvider` ships in v1.

---

## Suite Components

| Component | Role | Status |
|-----------|------|--------|
| `cerebro` CLI | Primary user-facing product; TUI + CLI commands + MCP server; suite documentation home | Active development |
| `@cowboylogic/cerebro-schema` | Shared npm package; canonical types, JSON Schema, ajv validator for `cerebro-catalog.yaml` | Stable |
| `cerebro-vscode-ext` | VS Code extension; GUI for the same discovery + install flow | Pending CLI completion |
| `cerebro-intellij-ext` | IntelliJ IDEA extension | Placeholder |
| `cerebro-vs-ext` | Visual Studio extension | Placeholder |
| `cerebro-eclipse-ext` | Eclipse extension | Placeholder |

A future `@cowboylogic/cerebro-core` package will extract the CLI's core layer (source provider, catalog, installer, manifest, config) for consumption by IDE extensions, eliminating duplication of install logic across products.

---

## Key Constraints

- **Schema is the contract.** A `cerebro-catalog.yaml` authored for one Cerebro tool must work with all Cerebro tools. The schema package is the enforcer. No product defines or re-declares catalog types locally.
- **Install paths are config-driven, not catalog-declared.** The catalog declares what an artifact is and where it lives in the source repo. Where it installs on the user's machine is determined by Cerebro's config. This decouples catalog authors from install path conventions, which change as the AI tooling landscape evolves.
- **Source access is provider-abstracted.** No module outside the provider layer has knowledge of GitHub-specific APIs. Adding a new source host (GitLab, Bitbucket) requires implementing the `SourceProvider` interface and registering the domain — nothing else changes.
- **Installer is non-destructive.** No silent overwrites. No writes to baseline files. Path confinement on every write.
- **stdout discipline.** In MCP mode, stdout is reserved exclusively for the JSON-RPC stream. Core modules never write to stdout regardless of execution mode.
- **Products do not deviate independently.** A product-level change that conflicts with suite-level goals requires a suite-level Architecture Decision first.

---

## Success Criteria (v1)

- A developer can `npx cerebro` and install a skill from `anthropics/skills` into Claude Code in under 60 seconds, with no prior configuration.
- A developer using the CLI can install an artifact to a different target (e.g. VS Code Copilot) by passing `--target copilot` — no session required.
- Any public GitHub repository with a `cerebro-catalog.yaml` is fully browsable and installable.
- Any public GitHub repository *without* a catalog produces reasonable heuristic results for repos following `SKILL.md` or `*.instructions.md` conventions.
- An AI agent can invoke `cerebro --mcp` and call `install_artifact` to autonomously install a skill without human interaction.
- The install manifest correctly reflects what is installed; browsing a source repo shows accurate status badges (Installed / Conflict / Exists / available).

---

## Open Questions

*(No unresolved questions at this time.)*

---

## Resolved Questions

*(Closed questions — moved here for record keeping.)*

- **Installed artifact tracking:** ✅ Resolved — `~/.config/cerebro/installed.yaml` manifest tracks every Cerebro install; used for status display and future update/remove support.
- **Update/reinstall behaviour:** ✅ Resolved — Non-destructive by default; status system (Installed/Conflict/Exists) surfaces current state; user must explicitly confirm overwrite. Full update command (detect new version via SHA comparison) is MVP+1.
- **Artifact versioning:** ✅ Partially resolved — `sourceSha` field reserved in manifest for future update detection. Version pinning deferred to a future release.
- **Non-GitHub sources:** ✅ Resolved architecturally — `SourceProvider` interface abstracts all source host access. GitLab/Bitbucket providers are explicit MVP+2/+3 backlog items.
- **Organisation registries:** ✅ Resolved — an "org registry" is a private source repository (GitHub or otherwise) with a `cerebro-catalog.yaml`. No first-class registry concept is needed beyond private repo support (MVP+1). This is in fact a primary motivation for building Cerebro: enabling teams to curate and distribute a standard set of AI tool configurations internally, with the same experience as any public source.
- **Artifact sets:** ✅ Resolved — single-repo sets (MVP+1); cross-repo/multi-repo sets (future). Schema already supports same-catalog sets via `ArtifactSet` / `sets[]`. MVP+1 adds TUI browsing, CLI `--set` flag, and MCP `install_set` tool. Cross-catalog set references deferred until single-repo sets prove adoption.
