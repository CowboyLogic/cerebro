# CLI-0001: Path Confinement as Non-Negotiable Security Layer

**Level:** CLI<br />
**Status:** Accepted<br />
**Date:** 2026-03-28<br />

## Context

The Cerebro CLI installs files from remote GitHub repositories onto the user's local filesystem. As established in S-0003, target paths come from catalog `files[].target` values — externally supplied strings authored by third parties. Even with catalog schema validation and name sanitization, a maliciously crafted `target` value could contain path traversal sequences (`../../`, `../`, absolute paths like `/etc/passwd`) that would cause writes to escape the intended install directory.

This is not a theoretical concern: path traversal via configuration files is a well-documented attack vector, and Cerebro's trust model (install from any public GitHub repo) makes it a realistic one.

## Decision

Every file write performed by any Cerebro installer must be preceded by a call to `assertConfined(baseDir, resolvedPath)`. This function uses `path.resolve()` on both arguments and throws if the resolved target path does not start with the resolved base directory. There are no exceptions to this requirement and no bypass flags.

The base directory is always one of:
- **Workspace scope:** the nearest `.git` root above the working directory, or `process.cwd()` as fallback
- **Global scope:** `os.homedir()`

## Rationale

Defense in depth. Even if a catalog passes schema validation and a `target` value passes any string-level checks, `path.resolve()` on the filesystem eliminates ambiguity — it canonicalizes `..` traversals, symlinks (partially), and platform path separators before the comparison. The confinement check is the last line of defense before a write.

Alternatives considered:
- **String-based path validation (regex, `includes('..')`)** — rejected; string checks are bypassable through encoding, platform-specific separators, and edge cases. `path.resolve()` is the correct tool.
- **Confinement only for untrusted sources, not catalog-declared paths** — rejected; the attack surface is the catalog value itself; the source of trust is irrelevant at the point of the write.
- **User opt-out flag** — rejected; there is no legitimate reason for a Cerebro install to write outside the scoped base directory.

## Consequences

- Any new code that writes files must call `assertConfined()` before the write — this is a mandatory code review checklist item.
- Users cannot use Cerebro to install artifacts to arbitrary system paths, regardless of what the catalog declares.
- Legitimate catalogs that declare absolute paths or paths escaping the base directory will fail to install with a clear error message.

## Compliance

All installer implementations must call `assertConfined(baseDir, absoluteTarget)` before every `fs.writeFileSync()`. The base directory must be the resolved scope root — not a subdirectory, not a relative path. Code review must treat any file write without a preceding confinement check as a security defect requiring immediate remediation. This requirement extends to all future Cerebro products that perform file installation.

---

*Supersedes: (none)*
*Related: [S-0003](S-0003-installer-follows-catalog-targets.md)*
