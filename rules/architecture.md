---
paths:
  - "scripts/**"
  - "tests/**"
  - "sources.md"
  - "skills/generate-strata-docs/**"
  - "docs/**"
---

# Architecture

Reference for the documentation pipeline, auto-loaded by Claude Code when you edit the scripts, the
`generate-strata-docs` skill, the manifest, or anything under `docs/`. Always-on orientation and the
command list live in `AGENTS.md`.

**The manifest drives everything.** `sources.md` is a markdown table (one row per source: `id`,
`type`, `repo`, `ref`, `subpaths`, `notes`). A source's `type` selects a profile in
`skills/generate-strata-docs/references/profiles/<type>.md` telling the documenter how to treat that
repo. `lint_manifest` rejects a `type` with no matching profile, so a new source type needs both a
manifest row and a profile file.

**Skill orchestration:**

```
Setup (clone to .sources/) → Run 1 DOCUMENT → build graph
  → Run 2 VERIFY→ADJUDICATE→FIX (per doc) → rebuild graph → CURATE → report
```

- **Run 1** (`workflows/run-1-document.mjs`): one `general-purpose` agent per source in parallel,
  each reading `skills/generate-strata-docs/references/agents/source-doc.md` + its profile + the
  registries, then writing docs to `docs/sources/<id>/` and a distillation log to
  `.logs/<id>.distillation.md`.
- **Run 2** (`workflows/run-2-verify-fix.mjs`): per doc, a bounded verify → adjudicate → fix loop
  (`max_rounds`, default 2); residual findings mark the doc `verified: needs-review`, audit trail in
  `docs/.verification/`. Agent role specs live under `skills/generate-strata-docs/references/agents/`.
- The skill commits to `Workflow` with no fallback: if unavailable it stops and escalates. Subagents
  never talk to the user.
- **full** mode documents every source; **update** mode only new + changed (`scripts/source_delta.py`),
  detecting drift by the clone's resolved SHA vs the `source_ref.ref` in existing docs and throttling
  re-documentation until a drifted source's docs are a week old.

**Frontmatter is the single source of truth for the graph.** Every doc under `docs/sources/<id>/`
starts with YAML frontmatter (contract:
`skills/generate-strata-docs/references/doc-frontmatter-schema.md`). `build_graph.py` derives
`docs/INDEX.md` and `docs/graph.json` purely from it; never edit those two by hand.

Two cross-link axes, both resolved through registries (fenced kebab-case key lists the linter parses):

- **Feature axis** (`skills/generate-strata-docs/references/feature-keys.md`): an `sdk` doc owns a
  key via `feature_keys`; an `example` doc uses it via `demonstrates`. The builder resolves each
  `demonstrates` to the owning SDK doc and emits an `example-of` edge.
- **Platform axis** (`skills/generate-strata-docs/references/platform-components.md`): a doc owns a
  component id via `component_keys`; `platform-cli` docs declare `manages`, app/infra docs declare
  `integrates_with`, both resolved to the owning doc.

`lint_docs` hard-fails on any `feature_keys`/`demonstrates`/`component_keys`/`manages`/
`integrates_with` value not in its registry. Add the key to the registry before writing any doc that
references it.

**"Never silently drop" invariant.** The pipeline surfaces every gap rather than hiding it. When
editing the graph builder, linter, or delta classifier, emit a visible record rather than discarding:

- Clone failure: source recorded **skipped**, not dropped.
- Registry-valid key with no owning doc: `build_graph` prints a `GAP:` line.
- Unresolved findings: doc marked `verified: needs-review`.
- Source removed from `sources.md` with docs still present: `source_delta` reports **orphaned**.
- Drifted source documented under a week ago: `source_delta` reports **throttled**.

## Local reminder hooks

`.claude/settings.json` registers non-blocking `PreToolUse` hooks (one entry per check, under the
`Bash` matcher) that keep durable-artifact conventions in front of an agent as it acts: route
`gh pr create` / `gh issue create` through the create-pr / create-issue skills, and print the
staged-vs-unstaged file lists before `git commit`. Each check is a pure
`reminder(command) -> str | None` in its own `scripts/hooks/` module, wired to a single stdin/stdout
contract in `scripts/hooks/__init__.py`; the module docstrings are the contract, so read those before
changing a check. Reminders only guide, never block (they emit `additionalContext`, never a
`permissionDecision`), so create-pr's own `gh pr create` proceeds. `.claude/settings.json` is
committed and shared; `.claude/settings.local.json` is per-user and not committed.

## Conventions

- `docs/.verification/` and `docs/.curation/` are audit trail. Keep them.
- `scripts/frontmatter.py` is the shared YAML parser for linter and graph builder. Change it in one
  place.
- The design spec and plan live in `docs/superpowers/{specs,plans}/`; section references like `§3.3`
  in code and the skill point back to that spec.
