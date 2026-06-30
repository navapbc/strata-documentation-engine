# Strata Documentation Engine

Generates and self-verifies documentation for the Strata project family from a list of
sources, producing a linked, agent-queryable knowledge base.

## How it works

1. `sources.md` lists each source (`id`, `type`, `repo`, `ref`, optional `subpaths`) —
   the SDK, the Rails app template, SDK-consuming apps like OSCER, the `template-infra`
   infrastructure template, and the `platform-cli` (`nava-platform`) tool.
2. The `generate-strata-docs` skill documents each source (one agent per source) using the
   type's profile in `skills/generate-strata-docs/references/profiles/`. The `sdk`,
   `infra-template`, and `platform-cli` documenters distill each source's own `docs/`
   (verifying against code); each doc is tagged with canonical `feature_keys`/`demonstrates`
   from `references/feature-keys.md` and `component_keys`/`manages`/`integrates_with` from
   `references/platform-components.md`.
3. `scripts/build_graph.py` builds `docs/INDEX.md` and `docs/graph.json` from doc frontmatter,
   linking each example to the SDK feature it `demonstrates` (`example-of`), and the CLI/templates
   to the components they `manage` / `integrate with` (`manages` / `integrates-with`).
4. An adjudicated verify→fix loop checks each doc against its source; unresolved docs are
   marked `verified: needs-review` with findings in `docs/.verification/`.
5. A curator reviews the run's distillation logs into `docs/.curation/improvements.md`.

## Running it

- **Locally:** open this repo in Claude Code and invoke the `generate-strata-docs` skill
  (uses your own Claude auth; needs git access to the source repos and Python 3.13).
- **In CI:** the `Generate Strata Docs` Action (manual, weekly, or on `sources.md` change)
  runs the skill and opens a PR.
  Requires the `ANTHROPIC_API_KEY` and `SOURCES_READ_TOKEN` secrets.

## Developing

```bash
pip install -r scripts/requirements.txt pytest
python -m pytest -v
python -m scripts.lint_manifest
python -m scripts.lint_docs
```

See `docs/superpowers/specs/2026-06-18-strata-documentation-engine-design.md` for the design.
