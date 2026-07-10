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
python -m pytest tests/test_lint_docs.py::test_validate_doc_accepts_valid -v  # one test
python -m pytest -k frontmatter -v                # by pattern

# Lint / build pipeline (run in order; each prints a *_OK sentinel)
python -m scripts.lint_manifest       # validate sources.md -> MANIFEST_OK
python -m scripts.lint_docs           # validate doc frontmatter + registry use -> DOCS_OK
python -m scripts.build_graph         # write docs/INDEX.md + docs/graph.json -> GRAPH_OK
```

Run scripts as modules (`python -m scripts.x`), not files; `pyproject.toml` sets
`pythonpath = ["."]` so `scripts/` and `tests/` resolve. `lint_manifest --json` emits the parsed
sources and `source_delta --json` classifies each source (new/changed/unchanged/throttled/orphaned);
both are skill-runtime helpers, not part of the manual dev pipeline.

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
file the first draft: run the `review-draft` skill, which checks quality, template adherence, voice,
punctuation, house style, and formatting (no hard-wrapped issue or PR bodies, see `CONTRIBUTING.md`),
then revises. File only after the caller or user approves the revision.

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
what an agent or new developer needs to pick up work cold.

The `create-issue` skill guides checking for duplicates, choosing the template, wording, labeling, reviewing, and filing.
After initial human review, the `refine-issue` skill pressure-tests an existing issue for sprint
readiness.

## Architecture and CI

Deep reference lives in rule files under `rules/` at the repo root. Claude Code auto-loads each
when you touch a path its `paths:` frontmatter matches; other tools do not, so open the relevant file
directly when working the paths noted below.

- `rules/architecture.md`: the manifest, skill orchestration, the frontmatter-driven graph,
  and the "never silently drop" invariant. Applies when editing `scripts/`, `tests/`, `sources.md`,
  `skills/generate-strata-docs/`, or anything under `docs/`.
- `rules/ci.md`: the lint pipeline and the doc-generation workflows. Applies when editing
  `.github/workflows/` or doc frontmatter.
- `rules/subagent-model-tiers.md`: which Claude model to give a sub-agent that a skill dispatches
  via the `Agent`/Task tool. Applies when editing anything under `skills/`.

## Conventions and gotchas

- `.sources/` and `.logs/` are runtime, gitignored; absent in a clean tree.
- The `skills/` directory is symlinked whole into `.claude/skills` and `.agents/skills`, so cloning the
  repo loads every skill without copying: Claude Code reads `.claude/skills`, and Cursor, Codex, and
  Copilot read `.agents/skills`. Edit skills under `skills/`; adding one needs no symlink change, since
  both links point at the whole directory.
- `.claude/settings.json` (committed) registers the local reminder hooks in `scripts/hooks/`;
  `.claude/settings.local.json` is per-user and not committed. See `rules/architecture.md`.
- `docs/INDEX.md` and `docs/graph.json` are generated by `build_graph`; never hand-edit them.
- `docs/.verification/` and `docs/.curation/` are the audit trail; never delete them.
- Other pipeline-internal conventions (the shared `scripts/frontmatter.py` parser) live in
  `rules/architecture.md`.

## Documentation maintenance

Keep these current as the project evolves; update before closing the PR.

| What changed | Update |
|---|---|
| New script, command, or CLI flag | `README.md`, `CONTRIBUTING.md`, and Commands above |
| New source type | Profile in `skills/generate-strata-docs/references/profiles/` and `sources.md` |
| New registry key | The relevant registry file, before any doc references it |
| New issue template or workflow convention | `CONTRIBUTING.md` and Workflow above |
| Architecture change | `rules/architecture.md` |
| CI workflow change | `rules/ci.md` |

If a change makes a section stale, update it in the same PR. Do not leave documentation that
contradicts the code.
