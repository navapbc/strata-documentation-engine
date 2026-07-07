---
paths:
  - ".github/workflows/**"
  - "docs/sources/**"
  - "docs/INDEX.md"
  - "docs/graph.json"
---

# CI

Auto-loaded by Claude Code when you edit a workflow or regenerate the graph. Always-on orientation
lives in `AGENTS.md`.

- **lint.yml**: pytest → lint_manifest → lint_docs → graph freshness (`build_graph` then
  `git diff --exit-code` on `docs/INDEX.md` + `docs/graph.json`). Commit regenerated
  `INDEX.md`/`graph.json` whenever doc frontmatter changes.
- **generate-docs.yml** / **update-docs.yml**: manual only; full-mode and update-mode skill runs
  opening PRs on `docs/full-regen` / `docs/auto-update`. Both need `ANTHROPIC_API_KEY` and
  `SOURCES_READ_TOKEN` secrets.
