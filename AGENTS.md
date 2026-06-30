# Agent and Developer Guide

This file is the canonical instruction set for both human developers and AI agents working in this
repository. `CLAUDE.md` is a symlink to this file. Edit only `AGENTS.md`.

## What this is

The Strata Documentation Engine generates and self-verifies documentation for the Strata project
family (the SDK, Rails app template, infra template, `platform-cli`, and SDK-consuming apps like
OSCER). It pulls source repos listed in `sources.md`, has Claude write per-source docs, then builds
a frontmatter-derived index + graph and runs an adversarial verify→fix loop over each doc.

There are two distinct layers, edited very differently:

1. **Generation layer**: non-deterministic, Claude-driven. The `generate-strata-docs` skill
   (`skills/generate-strata-docs/SKILL.md`) orchestrates two multi-agent `Workflow` runs. Invoke
   this; rarely hand-edit its output.
2. **Validation / graph layer**: deterministic Python in `scripts/`. This is the spine that
   enforces correctness and is what you'll most often edit and test. Output is reproducible from
   doc frontmatter alone.

## Before starting any task

1. Read `README.md` for a current project overview.
2. Read `CONTRIBUTING.md` for branch naming, commit template, and pipeline conventions.
3. If the work relates to an existing GitHub issue, read it in full before touching code.
4. If no issue exists yet for the work, create one using the appropriate template (see
   [Issue templates](#issue-templates)) before opening a branch.

## Commands

Requires Python 3.13.

```bash
# Python setup
pip install -r scripts/requirements.txt pytest

# Tests
python -m pytest -v                                  # all
python -m pytest tests/test_lint_docs.py -v          # one file
python -m pytest tests/test_lint_docs.py::test_validate_doc_accepts_valid -v   # one test
python -m pytest -k frontmatter -v                   # by pattern

# Lint / build pipeline (run in order; each prints a *_OK sentinel on success)
python -m scripts.lint_manifest          # validates sources.md -> "MANIFEST_OK"
python -m scripts.lint_manifest --json   # emits parsed sources (used by the skill at runtime)
python -m scripts.lint_docs              # validates doc frontmatter + registry usage -> "DOCS_OK"
python -m scripts.build_graph            # writes docs/INDEX.md + docs/graph.json -> "GRAPH_OK"
python -m scripts.source_delta --json    # skill-runtime only (not part of the manual dev pipeline): classify sources new/changed/unchanged/throttled/orphaned
```

Scripts are run as modules (`python -m scripts.x`), not as files; `pyproject.toml` sets
`pythonpath = ["."]` so `scripts/` and `tests/` resolve.

## Workflow

### Branching

```
<github-username>/<issue-number>-<short-kebab-description>
```

Skip the repo-name prefix when the branch lives in this repo. Include the originating project name
when a branch in this repo addresses an issue from a different project:

```
jeffhorn/oscer-42-short-description
```

### Pull requests

Open all PRs as drafts. Mark ready for review only after self-review is complete.

Use `.github/PULL_REQUEST_TEMPLATE.md`. GitHub pre-populates it automatically.

### Commits

Wire up the commit message template once per clone:

```bash
git config commit.template .gitmessage
```

Subject line: imperative mood, 50 chars or less. Body (optional): explain why, not what. Reference
issues with `Closes #n` or `Relates to #n`.

## Issue templates

Use the template that best fits the work. GitHub surfaces these when you open a new issue.

| Template | Use for |
|---|---|
| `epic.md` | Large initiatives framed around an outcome; decompose before work begins |
| `story.md` | User-facing features or improvements |
| `bug.md` | Broken or unexpected behavior |
| `technical-task.md` | Implementation handoffs to another developer or agent |
| `spike.md` | Time-boxed investigations; output is findings, not shipped code |
| `chore.md` | Non-user-visible maintenance (deps, CI, tooling) |

For `technical-task.md` specifically: fill in the "Starting point" and "Constraints and gotchas"
sections thoroughly. These are the fields an agent or new developer needs most to pick up work cold.

## Architecture

### The manifest drives everything

`sources.md` is a markdown table (one row per source: `id`, `type`, `repo`, `ref`, `subpaths`,
`notes`). A source's `type` selects a **profile** in
`skills/generate-strata-docs/references/profiles/<type>.md` that tells the documenter agent how to
treat that kind of repo. `lint_manifest` rejects a source whose `type` has no matching profile, so
adding a new source type means adding both a manifest row and a profile file.

### Skill orchestration

```
Setup (clone sources to .sources/) → Run 1 DOCUMENT → build graph
  → Run 2 VERIFY→ADJUDICATE→FIX (per doc) → rebuild graph → CURATE → report
```

- **Run 1** (`workflows/run-1-document.mjs`): one `general-purpose` agent per source, in parallel.
  Each reads `skills/generate-strata-docs/references/agents/source-doc.md` + its profile + the registries, then writes docs to
  `docs/sources/<id>/` and a distillation log to `.logs/<id>.distillation.md`.
- **Run 2** (`workflows/run-2-verify-fix.mjs`): per doc, a bounded loop (`max_rounds`, default 2) of
  verify → adjudicate → fix using four agent roles (`skills/generate-strata-docs/references/agents/{verifier,adjudicator,fixer}.md`). A
  verifier finds claims unsupported by the source; an adjudicator confirms/rejects each by
  re-checking the source; a fixer edits only confirmed findings. Residual findings after the last
  round mark the doc `verified: needs-review`, with the audit trail in `docs/.verification/`.
- The skill commits to the `Workflow` tool with **no fallback**: if `Workflow` is unavailable, it
  stops and escalates. Subagents never talk to the user.
- The skill runs in **full** mode (document every source) or **update** mode (only new + changed
  sources, computed by `scripts/source_delta.py`). Drift is detected by comparing each clone's
  resolved commit SHA against the `source_ref.ref` recorded in that source's existing docs. Update
  mode throttles: a drifted source is re-documented only once its docs are at least a week old.

### Frontmatter is the single source of truth for the graph

Every doc under `docs/sources/<id>/` starts with YAML frontmatter
(contract: `skills/generate-strata-docs/references/doc-frontmatter-schema.md`). `build_graph.py`
derives `docs/INDEX.md` and `docs/graph.json` purely from that frontmatter. Never edit those two
files by hand.

Two cross-link axes connect docs, both resolved through registries (fenced kebab-case key lists
the linter parses):

- **Feature axis** (`skills/generate-strata-docs/references/feature-keys.md`): an `sdk` doc owns a
  key via `feature_keys`; an `example` doc uses it via `demonstrates`. The graph builder resolves
  each `demonstrates` key to the owning SDK doc and emits an `example-of` edge.
- **Platform axis** (`skills/generate-strata-docs/references/platform-components.md`): a doc owns a
  component id via `component_keys`; `platform-cli` docs declare `manages`, and app/infra docs
  declare `integrates_with`, both resolved to the owning doc.

`lint_docs` **hard-fails** on any `feature_keys`/`demonstrates`/`component_keys`/`manages`/
`integrates_with` value not in its registry. Add a new feature or component key to the registry
first, before writing any doc that references it.

### "Never silently drop" invariant

The pipeline surfaces every gap rather than hiding it. When editing the graph builder, linter, or
delta classifier, preserve this: emit a visible record rather than discarding.

- Clone failure: source recorded **skipped**, not dropped
- Registry-valid key with no owning doc: `build_graph` prints a `GAP:` line
- Unresolved verification findings: doc marked `verified: needs-review`
- Source removed from `sources.md` with docs still present: `source_delta` reports **orphaned**
- Drifted source documented less than a week ago: `source_delta` reports **throttled**

## CI

- **lint.yml**: pytest → lint_manifest → lint_docs → graph freshness check (`build_graph` then
  `git diff --exit-code` on `docs/INDEX.md` + `docs/graph.json`). **Commit regenerated
  `INDEX.md`/`graph.json` whenever doc frontmatter changes** or CI fails.
- **generate-docs.yml**: manual only. Full-mode skill run; opens a PR on `docs/full-regen`.
- **update-docs.yml**: manual only. Update-mode skill run; opens a PR on `docs/auto-update`.
  Both workflows need `ANTHROPIC_API_KEY` and `SOURCES_READ_TOKEN` secrets.

## Conventions and gotchas

- `.sources/` and `.logs/` are runtime, gitignored directories; absent in a clean tree.
- `docs/.verification/` and `docs/.curation/` are audit trail. Keep them.
- `scripts/frontmatter.py` is the shared YAML parser for both the linter and graph builder.
  Change it in one place.
- The design spec and plan live in `docs/superpowers/{specs,plans}/`; section references like
  "§3.3" in the code and skill point back to that spec.

## Documentation maintenance

These files must stay current as the project evolves. When any of the following changes, update
the corresponding documentation before closing the PR:

| What changed | Update |
|---|---|
| New script, command, or CLI flag | `README.md` (Developing section), `CONTRIBUTING.md` (pipeline section), and this file (Commands section) |
| New source type | Profile file in `skills/generate-strata-docs/references/profiles/` and `sources.md` manifest table |
| New registry key (feature or component) | The relevant registry file before any doc references it |
| New issue template or workflow convention | `CONTRIBUTING.md` and this file (Workflow section) |
| Architecture change | This file (Architecture section) and `docs/superpowers/specs/` if the design spec is affected |
| CI workflow change | This file (CI section) |

If a change makes a section of this file stale, update it in the same PR. Do not leave
documentation that contradicts the code.
