# Strata Documentation Engine

Generates and self-verifies documentation for the Strata project family from a list of
sources, producing a linked, agent-queryable knowledge base.

## How it works

1. `sources.md` lists each source (`id`, `type`, `repo`, `ref`, optional `subpaths`):
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
- **In CI:** the `Generate Strata Docs` Action (manual)
  runs the skill and opens a PR.
  Requires the `ANTHROPIC_API_KEY` and `SOURCES_READ_TOKEN` secrets.

## strata-qa — documentation Q&A CLI

`strata-qa/` is a self-contained TypeScript CLI (isolated from the Python pipeline) that answers a
natural-language question from the generated docs graph via the Cursor SDK, with a deterministic
quote-verified grounding gate: every citation must resolve to a `docs/graph.json` node **and** carry
a verbatim quote found in the cited doc, or the tool refuses. Default model is `gpt-5.6-luna`.

```bash
cd strata-qa && npm install                      # setup (Node 22)
npm test                                         # vitest units — no live model calls
npm run qa -- "how does OSCER authenticate API requests?" --docs-root ..
npm run qa -- eval --docs-root ..                # score fixtures/golden.json (live model)
```

Live runs need `CURSOR_API_KEY` (a personal or service-account key). `--timeout <seconds>` bounds
each live model call (default 60). Each run prints one JSON object to stdout; refusals (`no_match`,
`low_confidence`) exit 0, operational failures exit non-zero (auth, model, docs, lockdown, parse,
transport, timeout). Query and refusal logs land in `.logs/qa/` (gitignored).

## Developing

```bash
pip install -r scripts/requirements.txt pytest
python -m pytest -v
python -m scripts.lint_manifest
python -m scripts.lint_docs
```

Opening the repo in Claude Code loads local `PreToolUse` reminder hooks (`scripts/hooks/`, registered
in `.claude/settings.json`) that nudge `gh pr create` / `gh issue create` toward the create-pr /
create-issue skills and list the staged set before `git commit`. They only remind, never block; see
`rules/architecture.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, branch naming, commit
conventions, and the issue and PR templates. `AGENTS.md` is the canonical guide for both human
contributors and AI agents.
