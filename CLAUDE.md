# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Strata Documentation Engine generates and self-verifies documentation for the Strata project
family (the SDK, Rails app template, infra template, `platform-cli`, and SDK-consuming apps like
OSCER). It pulls source repos listed in `sources.md`, has Claude write per-source docs, then builds
a frontmatter-derived index + graph and runs an adversarial verify→fix loop over each doc.

There are two distinct layers, and they are edited very differently:

1. **Generation layer** — non-deterministic, Claude-driven. The `generate-strata-docs` skill
   (`skills/generate-strata-docs/SKILL.md`) orchestrates two multi-agent `Workflow` runs. You
   *invoke* this; you rarely hand-edit its output.
2. **Validation / graph layer** — deterministic Python in `scripts/`. This is the spine that
   enforces correctness and is what you'll most often edit and test. Output is reproducible from
   doc frontmatter alone.

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

# Lint / build pipeline (run in this order; each prints a *_OK sentinel on success)
python -m scripts.lint_manifest          # validates sources.md -> "MANIFEST_OK"
python -m scripts.lint_manifest --json   # emits parsed sources (used by the skill at runtime)
python -m scripts.lint_docs              # validates doc frontmatter + registry usage -> "DOCS_OK"
python -m scripts.build_graph            # writes docs/INDEX.md + docs/graph.json -> "GRAPH_OK"
python -m scripts.source_delta --json    # update mode: classify sources new/changed/unchanged/throttled/orphaned (skill passes --shas-file; --now/--min-age-days tune the staleness throttle)
```

Scripts are run as modules (`python -m scripts.x`), not as files — `pyproject.toml` sets
`pythonpath = ["."]` so `scripts/` and `tests/` resolve.

## Architecture

### The manifest drives everything

`sources.md` is a markdown table (one row per source: `id`, `type`, `repo`, `ref`, `subpaths`,
`notes`). A source's `type` selects a **profile** in
`skills/generate-strata-docs/references/profiles/<type>.md` that tells the documenter agent how to
treat that kind of repo. `lint_manifest` rejects a source whose `type` has no matching profile, so
adding a new source type means adding both a manifest row and a profile file.

### The skill orchestration (SKILL.md)

```
Setup (clone sources to .sources/) → Run 1 DOCUMENT → build graph
  → Run 2 VERIFY→ADJUDICATE→FIX (per doc) → rebuild graph → CURATE → report
```

- **Run 1** (`workflows/run-1-document.mjs`): one `general-purpose` agent per source, in parallel.
  Each reads `agents/source-doc.md` + its profile + the registries, then writes docs to
  `docs/sources/<id>/` and a distillation log to `.logs/<id>.distillation.md`.
- **Run 2** (`workflows/run-2-verify-fix.mjs`): per doc, a bounded loop (`max_rounds`, default 2) of
  verify → adjudicate → fix using four agent roles (`agents/{verifier,adjudicator,fixer}.md`). A
  verifier finds claims unsupported by the source; an adjudicator confirms/rejects each by
  re-checking the source; a fixer edits only confirmed findings. Residual findings after the last
  round mark the doc `verified: needs-review`, with the audit trail in `docs/.verification/`.
- The skill commits to the `Workflow` tool with **no fallback** — if `Workflow` is unavailable it
  stops and escalates. Subagents never talk to the user.
- The skill runs in **full** mode (document every source) or **update** mode (only new + changed
  sources, computed by `scripts/source_delta.py`, with unchanged sources skipped); the invoking
  prompt picks the mode. See SKILL.md "Modes". Drift is detected by comparing each clone's resolved
  commit SHA against the `source_ref.ref` recorded in that source's existing docs. Update mode also
  **throttles**: a drifted source is re-documented only once its docs (`last_documented` date) are
  at least a week old, so a frequently-changing repo isn't re-documented every run.

### Frontmatter is the single source of truth for the graph

Every doc under `docs/sources/<id>/` starts with YAML frontmatter
(contract: `references/doc-frontmatter-schema.md`). `build_graph.py` derives `docs/INDEX.md` and
`docs/graph.json` *purely* from that frontmatter — never edit those two files by hand.

Two cross-link axes connect docs, both resolved through **registries** (fenced kebab-case key lists
that the linter parses):

- **Feature axis** (`references/feature-keys.md`): an `sdk` doc *owns* a key via `feature_keys`; an
  `example` doc *uses* it via `demonstrates`. The graph builder resolves each `demonstrates` key to
  the owning SDK doc and emits an `example-of` edge.
- **Platform axis** (`references/platform-components.md`): a doc *owns* a component id via
  `component_keys`; `platform-cli` docs declare `manages`, and app/infra docs declare
  `integrates_with`, both resolved to the owning doc (`manages` / `integrates-with` edges).

`lint_docs` **hard-fails** on any `feature_keys`/`demonstrates`/`component_keys`/`manages`/
`integrates_with` value not present in its registry. So a doc may only reference a feature/component
by a registry key — never by a not-yet-generated doc id. Adding a new feature/component means adding
its key to the registry's fenced block first.

### "Never silently drop" invariant

The pipeline surfaces every gap instead of hiding it: a clone failure → the source is recorded
**skipped** (not dropped); a registry-valid `demonstrates`/`manages` key that no doc owns →
`build_graph` prints a `GAP:` line; unresolved verification findings → `verified: needs-review`;
a `docs/sources/<id>/` whose source left `sources.md` → `source_delta` reports it **orphaned**
(never auto-deleted); a drifted source documented less than a week ago → `source_delta` reports it
**throttled** with a warning (skipped this run, not silently dropped). When editing the graph builder, linter, or delta classifier, preserve this —
emit a visible record rather than discarding.

## CI (`.github/workflows/`)

- **lint.yml** (`scripts/`, `tests/`, `docs/`, `sources.md`, `skills/` changes): pytest →
  lint_manifest → lint_docs → **graph freshness** (`build_graph` then `git diff --exit-code` on
  `docs/INDEX.md` + `docs/graph.json`). The freshness check means **you must commit regenerated
  `INDEX.md`/`graph.json` whenever doc frontmatter changes**, or CI fails.
- **generate-docs.yml**: **manual only** (`workflow_dispatch`). Runs the skill in **full** mode and
  opens a PR on `docs/full-regen`. For deliberate, maintainer-run full rebuilds — not a cron job,
  and not triggered by pushes/merges.
- **update-docs.yml**: **manual only** (`workflow_dispatch`). Runs the skill in **update** mode
  (re-document only changed sources, full-generate brand-new ones, skip unchanged) and opens a PR
  on `docs/auto-update`. Both Claude workflows need `ANTHROPIC_API_KEY` and `SOURCES_READ_TOKEN`
  secrets.

## Conventions & gotchas

- `.sources/` (source checkouts) and `.logs/` (distillation logs) are runtime, gitignored
  directories — present during a skill run, absent in a clean tree.
- `docs/.verification/` (per-doc findings) and `docs/.curation/improvements.md` (advisory process
  notes from the curator) are kept as audit trail under `docs/`.
- `scripts/frontmatter.py` is the shared YAML-frontmatter parser used by both the linter and the
  graph builder — change it in one place.
- The design spec and plan live in `docs/superpowers/{specs,plans}/`; section references like
  "§3.3" in the code and skill point back to that spec.
