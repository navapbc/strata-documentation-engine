---
name: generate-strata-docs
description: Generates, links, and self-verifies documentation for the Strata project family — documents each source in sources.md, builds a frontmatter-derived index and graph, then runs an adjudicated verify-fix loop. Use when (re)generating Strata docs.
---

# Generate Strata Docs

## Overview

Documents every source in `sources.md`, builds `docs/INDEX.md` + `docs/graph.json` from doc
frontmatter, then adversarially verifies and fixes each doc. This skill is an **orchestrator**:
it drives Python tooling and `Workflow` runs. Subagents never talk to the user.

```
Setup → Run 1 DOCUMENT → build graph → Run 2 VERIFY→ADJUDICATE→FIX (per doc) → rebuild graph → CURATE → report
```

## Modes

The invoking prompt selects one of two modes (**full** is the default):

- **full** — document **every** source in `sources.md` and verify every doc. For the initial
  bootstrap and deliberate full rebuilds (`generate-docs.yml`, manual only).
- **update** — document only **new** sources (no `docs/sources/<id>/` yet) and **changed** sources
  (upstream drifted since last documented), verify only those docs, and **skip unchanged** sources.
  A drifted source is only re-documented once its docs are **at least one week old** (the
  `last_documented` frontmatter date); a source that drifted but was documented more recently is
  **throttled** (skipped this run, surfaced not dropped) so a frequently-changing repo isn't
  re-documented every run. For routine refresh (`update-docs.yml`, weekly + manual). The
  new/changed/unchanged/throttled split is computed by `scripts/source_delta.py`.

The flow below is shared; the **Select what to document** step is where the two modes diverge.

## Setup

Resolve `<REFS>` = absolute path to `skills/generate-strata-docs/references`.

Capture a single run date for this invocation: `run_date=$(date -u +%F)` (ISO `YYYY-MM-DD`). It is
stamped into each doc's `last_documented` so update mode can throttle re-documentation of
frequently-changing sources.

1. Validate and load the manifest:
   - `python -m scripts.lint_manifest` — must print `MANIFEST_OK`. If it fails, stop and report.
   - `python -m scripts.lint_manifest --json` — parse the JSON list of sources.
2. For each source, ensure a checkout at `.sources/<id>` at the pinned `ref`:
   `git clone --depth 1 --branch <ref> <repo> .sources/<id>` (or fetch the SHA). The token in
   the environment (`GH_TOKEN`/git credentials) provides access. If a clone fails (bad ref / no
   access), record the source as **skipped** and continue — never silently drop it. Capture each
   clone's resolved commit SHA with `git -C .sources/<id> rev-parse HEAD`.
3. Build the full `sources` array: `{ id, type, repo, ref, subpaths, resolved_sha,
   src_dir: ".sources/<id>" }`, excluding skipped sources. `resolved_sha` is written into each
   doc's `source_ref.ref` so update mode can detect drift.

## Select what to document (by mode)

- **full mode**: `to_document` = the entire `sources` array.
- **update mode**: write the `{ id: resolved_sha }` map to a temp file and run
  `python -m scripts.source_delta --shas-file <file> --json`. Parse the JSON
  `{ new, changed, unchanged, throttled, orphaned, warnings }`. `to_document` = the `sources`
  entries whose id is in `new` or `changed` (`throttled` is already excluded). Keep `unchanged`,
  `throttled`, `orphaned`, and `warnings` for the report — never drop them. (`throttled` = a
  drifted source documented less than a week ago, deliberately skipped this run; `orphaned` = a
  `docs/sources/<id>/` whose source left `sources.md`, surfaced, not auto-deleted.)

## Run 1 — Document

Read `workflows/run-1-document.mjs` and call:

```
Workflow({ script: <contents of run-1-document.mjs>,
           args: { refs_dir: "<REFS>", sources: <to_document>, run_date: "<run_date>" } })
```

Collect `results`. Note any `skipped: true` sources and any sources that returned zero docs.

## Build the graph

Run `python -m scripts.lint_docs` (must print `DOCS_OK`; this hard-fails on any
`feature_keys`/`demonstrates` not in the feature-key registry or any
`component_keys`/`manages`/`integrates_with` not in the platform-component registry — fix or
report failures) then `python -m scripts.build_graph` to write `docs/INDEX.md` and
`docs/graph.json`. Note any `GAP:` lines (a `demonstrates` key no `sdk` doc owns, or a
`manages`/`integrates_with` id no doc owns) — surface them in the report, never drop.

## Run 2 — Verify → Adjudicate → Fix

Build the `docs` array from the generated files: `{ id, path, source, src_dir: ".sources/<source>" }`
(one entry per doc under `docs/sources/`). In **update mode**, include only docs whose `source` is
in `to_document` (new + changed) — unchanged sources' docs are not re-verified. Read
`workflows/run-2-verify-fix.mjs` and call:

```
Workflow({ script: <contents of run-2-verify-fix.mjs>,
           args: { refs_dir: "<REFS>", docs: <docs array>, max_rounds: 2 } })
```

For each result: set the doc's frontmatter `verified: ok` or `verified: needs-review` to match
`status`. Findings live at `docs/.verification/<doc-id>.findings.md` (kept as the audit trail).

## Rebuild the graph

Run `python -m scripts.build_graph` again (frontmatter may have changed), then
`python -m scripts.lint_docs` to confirm `DOCS_OK`.

## Curate

Dispatch one curator agent (read `agents/curator.md`) that reads all `.logs/*.distillation.md`
and writes `docs/.curation/improvements.md`. Advisory only — it never edits docs or frontmatter,
so it cannot affect the graph or trip the verify loop. If it fails or finds nothing, log it and
continue (it never blocks the doc output).

## Report / publish

Summarize: docs generated per source, sources **skipped** (with reason), docs marked
**needs-review** (with findings paths), and any feature-key or platform-component **gaps**
(`GAP:` lines). In **update mode** also report the **unchanged** sources skipped as current, any
**throttled** sources (drifted but documented less than a week ago, deliberately skipped this
run), any **orphaned** sources (docs whose source left `sources.md`), and any `source_delta`
**warnings**.
In CI the
Action opens/updates the PR, **committing each doc with its `distillation_note` in the
commit message** for an auditable history; the temp `.logs/` are not committed. Locally, leave
`docs/**` in the working tree for the developer to review and commit.

## Notes

- One model per source / one verify-fix loop per doc. **full mode** rebuilds every source;
  **update mode** (via `scripts/source_delta.py`) re-documents only new + changed sources, skips
  unchanged ones, and throttles drifted sources whose docs are less than a week old.
- This skill commits to the `Workflow` tool (no fallback). If `Workflow` is
  unavailable in the runtime, stop and escalate — do not silently substitute another dispatch.
