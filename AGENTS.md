# Agent and Developer Guide

Canonical instruction set for human developers and AI agents in this repository. `CLAUDE.md` is a
symlink to this file; edit only `AGENTS.md`.

## What this is

The Strata Documentation Engine generates and self-verifies documentation for the Strata project
family (SDK, Rails app template, infra template, `platform-cli`, and SDK-consuming apps like OSCER).
It pulls source repos listed in `sources.md`, has Claude write per-source docs, then builds a
frontmatter-derived index + graph and runs an adversarial verify→fix loop over each doc.

Two layers, edited differently:

1. **Generation layer**: non-deterministic, Claude-driven. The `generate-strata-docs` skill
   orchestrates two multi-agent `Workflow` runs. Invoke it; rarely hand-edit its output.
2. **Validation / graph layer**: deterministic Python in `scripts/`. The spine that enforces
   correctness and what you'll most often edit and test. Reproducible from doc frontmatter alone.

## Before starting any task

1. Read `README.md` for a current overview.
2. Read `CONTRIBUTING.md` for branch naming, commit template, and pipeline conventions.
3. If the work relates to an existing GitHub issue, read it in full first.
4. If no issue exists, create one from the appropriate template (see
   [Issue templates](#issue-templates)) before opening a branch.

## Commands

Requires Python 3.13.

```bash
pip install -r scripts/requirements.txt pytest    # setup

python -m pytest -v                               # all tests
python -m pytest tests/test_lint_docs.py -v       # one file
python -m pytest -k frontmatter -v                # by pattern

# Lint / build pipeline (run in order; each prints a *_OK sentinel)
python -m scripts.lint_manifest       # validate sources.md -> MANIFEST_OK
python -m scripts.lint_docs           # validate doc frontmatter + registry use -> DOCS_OK
python -m scripts.build_graph         # write docs/INDEX.md + docs/graph.json -> GRAPH_OK
```

Run scripts as modules (`python -m scripts.x`), not files; `pyproject.toml` sets
`pythonpath = ["."]`. `lint_manifest --json` and `source_delta --json` are skill-runtime helpers,
not part of the manual dev pipeline.

## Workflow

### Branching

```
<github-username>/<issue-number>-<short-kebab-description>
```

Skip the repo-name prefix when the branch lives in this repo. Include the originating project name
for a cross-project issue: `jeffhorn/oscer-42-short-description`.

### Pull requests

Open all PRs as drafts; mark ready only after self-review. Use `.github/PULL_REQUEST_TEMPLATE.md`
(GitHub pre-populates it). The `create-pr` skill guides naming, filling the template, review, and
opening as a draft.

### Commits

Wire up the template once per clone: `git config commit.template .gitmessage`. Subject: imperative,
50 chars or less. Body (optional): why, not what. Reference issues with `Closes #n` or `Relates to #n`.

### Drafting durable artifacts

Before filing a durable, outward-facing artifact (issue, PR description, commit-message set), do not
file the first draft: run the `review-draft` skill (checks quality, template adherence, voice,
punctuation, house style, then revises), and file only after the caller or user approves the revision.

## Issue templates

Use the template that best fits the work; GitHub surfaces these on new-issue.

| Template | Use for |
|---|---|
| `epic.md` | Large outcome-framed initiatives; decompose before work begins |
| `story.md` | User-facing features or improvements |
| `bug.md` | Broken or unexpected behavior |
| `technical-task.md` | Implementation handoffs to another developer or agent |
| `spike.md` | Time-boxed investigations; output is findings, not shipped code |
| `chore.md` | Non-user-visible maintenance (deps, CI, tooling) |

For `technical-task.md`, fill "Starting point" and "Constraints and gotchas" thoroughly; those are
what an agent or new developer needs to pick up work cold. The `create-issue` skill guides choosing,
wording, labeling, reviewing, and filing.

## Architecture

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
  each writing docs to `docs/sources/<id>/` from its profile + the registries.
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

## CI

- **lint.yml**: pytest → lint_manifest → lint_docs → graph freshness (`build_graph` then
  `git diff --exit-code` on `docs/INDEX.md` + `docs/graph.json`). Commit regenerated
  `INDEX.md`/`graph.json` whenever doc frontmatter changes.
- **generate-docs.yml** / **update-docs.yml**: manual only; full-mode and update-mode skill runs
  opening PRs on `docs/full-regen` / `docs/auto-update`. Both need `ANTHROPIC_API_KEY` and
  `SOURCES_READ_TOKEN` secrets.

## Conventions and gotchas

- `.sources/` and `.logs/` are runtime, gitignored; absent in a clean tree.
- `docs/.verification/` and `docs/.curation/` are audit trail. Keep them.
- `scripts/frontmatter.py` is the shared YAML parser for linter and graph builder. Change it in one
  place.
- The design spec and plan live in `docs/superpowers/{specs,plans}/`; `§` references in code and the
  skill point back to that spec.

## Documentation maintenance

Keep these current as the project evolves; update before closing the PR.

| What changed | Update |
|---|---|
| New script, command, or CLI flag | `README.md`, `CONTRIBUTING.md`, and Commands above |
| New source type | Profile in `skills/generate-strata-docs/references/profiles/` and `sources.md` |
| New registry key | The relevant registry file, before any doc references it |
| New issue template or workflow convention | `CONTRIBUTING.md` and Workflow above |
| Architecture change | Architecture above, and `docs/superpowers/specs/` if the design spec is affected |
| CI workflow change | CI above |

If a change makes a section stale, update it in the same PR. Do not leave documentation that
contradicts the code.
