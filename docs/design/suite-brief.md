# Cerebro Suite — Design Brief

**Status:** Living document
**Last updated:** 2026-03-28

---

## Problem Statement

AI coding assistants (Claude Code, GitHub Copilot, Opencode, etc.) are increasingly extensible through skills, agents, prompts, instructions, hooks, and MCP servers. These artifacts are created by individuals and organizations and shared as files in GitHub repositories — but there is no standard way to discover, evaluate, or install them. Each tool has its own conventions, and users who work across multiple AI tools must manually manage installations that differ per tool.

**The result:** Valuable community-created artifacts go undiscovered. Teams that want to standardize AI tool configuration across their organization have no reliable mechanism to do so. Switching between AI tools means starting over.

---

## Vision

Cerebro is a suite of tools that makes AI artifact discovery and installation as straightforward as a package manager — browse a repository, select what you want, install it to the right place for your tool of choice.

The suite meets developers where they are: a CLI for those who live in the terminal, IDE extensions for those who prefer a GUI, and a shared catalog format that any repository maintainer can adopt to make their artifacts first-class Cerebro citizens.

---

## Target Users

**Primary:** Individual developers who use one or more AI coding assistants and want to extend them with community artifacts.

**Secondary:** Engineering teams and platform teams who want to curate and distribute a standard set of AI tool configurations across their organization (internal registries, approved skill sets, standardized agent configurations).

---

## Goals

1. **Universal discovery** — Browse AI artifacts from any public GitHub repository, with or without a `cerebro-catalog.yaml`.
2. **Multi-tool support** — Install the same artifact to Claude Code, GitHub Copilot, Opencode, and future tools from a single command or UI action.
3. **Catalog-driven control** — Repository maintainers who publish a `cerebro-catalog.yaml` get precise control over what installs where, for which tools, at which scope.
4. **Zero lock-in** — Cerebro installs standard files in standard locations. Uninstalling Cerebro doesn't break anything. The installed files work without Cerebro present.
5. **Safe by default** — File installation is confined to declared scopes (workspace or user home). Path traversal and scope escape are prevented at the installer layer regardless of catalog content.

## Non-Goals

1. **Runtime management** — Cerebro installs artifacts; it does not manage running agents, API keys, or AI tool processes.
2. **Artifact authoring** — Cerebro does not provide tooling for creating or editing artifacts.
3. **Version management** — Cerebro does not track versions or support rollback. Artifacts are fetched from the default branch at install time.
4. **Private registries (v1)** — Custom/private GitHub repos are supported via URL. A dedicated private registry feature is out of scope for the initial release.
5. **Non-GitHub sources (v1)** — GitLab, Bitbucket, and local filesystem sources are out of scope for the initial release.

---

## Suite Components

| Component | Role | Status |
|-----------|------|--------|
| `cerebro` CLI | Primary user-facing product; interactive wizard + CLI commands; suite documentation home | Active development |
| `cerebro-vscode-ext` | VS Code extension; GUI for the same discovery + install flow | Active development |
| `@cowboylogic/cerebro-schema` | Shared npm package; canonical types, JSON Schema, ajv validator | Stable |
| `cerebro-intellij-ext` | IntelliJ IDEA extension | Placeholder |
| `cerebro-vs-ext` | Visual Studio extension | Placeholder |
| `cerebro-eclipse-ext` | Eclipse extension | Placeholder |

---

## Key Constraints

- **Schema is the contract.** A `cerebro-catalog.yaml` authored for one Cerebro tool must work with all Cerebro tools. The schema package is the enforcer.
- **Installer is generic.** No tool-specific path logic in installer code. Target paths come from the catalog.
- **Path confinement is non-negotiable.** Every file write is checked against the install base directory before execution.
- **Products do not deviate independently.** A product-level change that conflicts with suite-level goals requires a suite-level ADR first.

---

## Success Criteria (v1)

- A developer can `npx cerebro` and install a skill from an arbitrary GitHub repo into Claude Code in under 60 seconds.
- A developer can install the same artifact into both Claude Code and GitHub Copilot in a single session.
- Any GitHub repository with a `cerebro-catalog.yaml` is fully browsable and installable without Cerebro-specific code.
- Any GitHub repository *without* a catalog produces reasonable heuristic results for repos following common AI artifact conventions.
- The VS Code extension provides equivalent functionality to the CLI with no additional configuration.

---

## Open Questions

*(Record unresolved questions here; move to ADRs or close them as they are decided.)*

- **Artifact versioning:** Should Cerebro support pinning to a specific commit or tag? How does this interact with catalog-based installs?
- **Update/reinstall behavior:** What happens when you install an artifact that's already installed? Overwrite silently, prompt, or refuse?
- **Installed artifact tracking:** Should Cerebro maintain a local manifest of what's installed (for future update/uninstall support)?
- **Organization registries:** What does a private/curated registry look like? How does authentication work?
- **Artifact sets:** The schema reserves `sets[]` but no tool has implemented set-based install yet.
