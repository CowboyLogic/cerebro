# Catalog format

A **Cerebro catalog** is a `cerebro-catalog.yaml` file placed in the root of a GitHub repository. It tells Cerebro what artifacts the repo contains, where to find them, and how to install them.

## Minimal example

```yaml
cerebro: "1"
name: My AI Components
artifacts:
  - id: git-commit-assistant
    name: Git Commit Assistant
    description: Generates conventional commit messages from staged changes
    type: skill
    source: skills/git-commit-assistant
```

Drop this file at the repository root. Users can then run:

```bash
cerebro list --source https://github.com/my-org/my-repo
cerebro install --source https://github.com/my-org/my-repo --id git-commit-assistant --target copilot
```

---

## Top-level fields

| Field | Required | Description |
|---|---|---|
| `cerebro` | **Yes** | Schema version. Must be the string `"1"` (quoted). |
| `name` | No | Display name for this catalog (max 100 chars). |
| `description` | No | Short description of the catalog (max 500 chars). |
| `artifacts` | **Yes** | List of artifact entries (at least one). |
| `sets` | No | Named groups of artifacts that can be installed together. |

---

## Artifact fields

Each entry in the `artifacts` list describes one installable item.

| Field | Required | Description |
|---|---|---|
| `id` | **Yes** | Unique slug for this artifact. Lowercase, `a-z0-9-`, no leading/trailing hyphen. Example: `git-commit-assistant`. |
| `name` | **Yes** | Human-readable display name (max 100 chars). |
| `type` | **Yes** | Artifact type (see [Types](#artifact-types) below). |
| `source` | **Yes** | Relative path to the artifact's root folder or file within the repo (see [Source paths](#source-paths)). |
| `description` | No | Short description shown in the item list (max 500 chars). |
| `supports` | No | List of compatible tools. Omit to allow any target. |
| `tags` | No | String tags for filtering and discovery. |

### Artifact types

| Type | MVP | Description |
|---|---|---|
| `skill` | ✓ | A folder containing a skill definition (e.g. `SKILL.md`). Installed as a folder. |
| `instruction` | ✓ | A single instruction file (e.g. `.instructions.md`). Installed as a file. |
| `prompt` | — | A reusable prompt template. Schema-valid, installer support coming. |
| `agent` | — | A pre-configured agent definition. |
| `hook` | — | A lifecycle hook script. |
| `mcp-server` | — | An MCP server definition. |
| `snippet` | — | A code snippet or template. |
| `workflow` | — | A workflow automation definition. |
| `other` | — | Anything else. |

Types marked ✓ are fully supported by the current Cerebro CLI installer. Other types are valid in the catalog but Cerebro will report an unsupported type error when installing them.

### Source paths

The `source` field is a repository-relative path to the artifact content:

- **Skill** (`type: skill`): path to the folder. Cerebro copies the entire folder into the target directory.
- **Instruction** (`type: instruction`): path to the file. Cerebro copies the file into the target directory.

Rules:
- Must be a relative path.
- Must not start with `/` or contain `..`.
- Do **not** include a leading `./`.

```yaml
# Skill — points to a folder
source: skills/git-commit-assistant

# Instruction — points to a file
source: instructions/python.instructions.md
```

### `supports` field

If omitted, the artifact is compatible with all tools. If provided, Cerebro will only allow installation to a target in the list.

Valid values: `agents`, `claude-code`, `copilot`, `cursor`, `windsurf`, `opencode`

```yaml
supports:
  - claude-code
  - copilot
```

---

## Sets (optional)

A `set` is a named collection of artifact IDs that can be installed together.

```yaml
sets:
  - id: python-dev
    name: Python Developer Pack
    description: Skills and instructions for Python development
    artifacts:
      - git-commit-assistant
      - python-type-hints
      - docstring-writer
```

Set fields:

| Field | Required | Description |
|---|---|---|
| `id` | **Yes** | Unique slug (same pattern as artifact IDs). |
| `name` | **Yes** | Human-readable display name (max 100 chars). |
| `description` | No | Optional description (max 500 chars). |
| `artifacts` | **Yes** | List of artifact IDs from this catalog's `artifacts` array. |

---

## Validation

The catalog schema is published at:

```
https://github.com/CowboyLogic/cerebro-schema/blob/main/schema/cerebro-catalog.schema.json
```

To validate your catalog locally:

```bash
cd cerebro-schema
npm install
npx ts-node src/validate.ts /path/to/cerebro-catalog.yaml
```

Or use any AJV-compatible JSON Schema validator with draft 2019-09 support.

---

## Without a catalog (heuristic fallback)

If a repository does not have a `cerebro-catalog.yaml`, Cerebro applies a heuristic scan: it looks for known folder structures (e.g. `SKILL.md` files) and synthesises a minimal catalog from what it finds. Results may be incomplete. Publishing a proper `cerebro-catalog.yaml` guarantees accurate discovery.

---

## Full example

```yaml
cerebro: "1"
name: My AI Components
description: Skills and instructions for my engineering team

artifacts:
  - id: git-commit-assistant
    name: Git Commit Assistant
    description: Generates conventional commit messages from staged changes
    type: skill
    source: skills/git-commit-assistant
    supports:
      - claude-code
      - copilot
    tags:
      - git
      - productivity

  - id: code-review-checklist
    name: Code Review Checklist
    description: Standard code review checklist as reusable instructions
    type: instruction
    source: instructions/code-review.instructions.md
    tags:
      - code-review

sets:
  - id: essential
    name: Essential Pack
    description: Recommended starting set
    artifacts:
      - git-commit-assistant
      - code-review-checklist
```
