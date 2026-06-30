# Doc frontmatter contract

Every generated doc under `docs/sources/<source-id>/` MUST begin with this YAML
frontmatter. It is the single source of truth for `INDEX.md` and `graph.json`.

```yaml
---
id: <globally-unique-kebab>        # e.g. sdk-application-forms
title: <human readable title>
source: <source id from sources.md>
doc_type: guide | feature | example
tags: [<kebab>, ...]
related: [<doc id>, ...]           # same-source free-form links; ids must resolve
feature_keys: [<key>, ...]         # sdk feature docs: canonical features this doc DEFINES
demonstrates: [<key>, ...]         # example docs: canonical features this doc SHOWS
component_keys: [<id>, ...]        # platform component(s) this doc DEFINES (platform-components.md)
manages: [<id>, ...]               # platform-cli docs: components this command installs/updates
integrates_with: [<id>, ...]       # components this source composes with (e.g. app <-> infra)
summary: <one sentence>
source_ref:
  repo: <git url>
  ref: <resolved commit SHA the doc was grounded in>   # full 40-char hash, not a branch name
  paths: [<path within the source>, ...]
verified: ok                       # set by the verify→fix loop; omit on first write
last_documented: <YYYY-MM-DD>      # date this doc was generated; drives the update-mode staleness throttle
---
```

Rules:
- `id` unique across ALL docs.
- `doc_type`: `guide` (how-to), `feature` (a capability the source provides),
  `example` (how a feature is used in a consuming app).
- `related` ids must exist (the linter rejects dangling links); they emit `related-to` edges.
- `feature_keys` (sdk docs) and `demonstrates` (example docs) MUST be keys from
  `references/feature-keys.md` (the linter hard-fails on any unknown key). An example doc's
  `demonstrates` key is resolved by the graph builder to the `sdk` doc whose `feature_keys`
  owns it, emitting an `example-of` edge — so **do NOT put a not-yet-generated SDK doc id in
  `related` to express "example of"; use `demonstrates: [<feature_key>]` instead.**
- `component_keys`, `manages`, and `integrates_with` MUST be ids from
  `references/platform-components.md` (the linter hard-fails on any unknown id). They drive the
  second cross-link axis: a `component_keys` id is *owned* by this doc; a `manages` id
  (`platform-cli` docs) or `integrates_with` id (app/infra docs) is resolved by the graph
  builder to the owning doc, emitting a `manages` / `integrates-with` edge — so, as with
  `demonstrates`, **reference the component by id, never by a not-yet-generated doc id.**
- `source_ref.ref` MUST be the **resolved commit SHA** of the checkout (e.g. `git rev-parse HEAD`),
  not the manifest's branch/tag. The update mode (`scripts/source_delta.py`) compares this SHA
  against the source's current upstream SHA to decide whether a doc needs re-generating; a bare
  branch name there forces a conservative full re-document.
- `last_documented` is the ISO date (`YYYY-MM-DD`) the doc was generated, set at write time to the
  run date provided to the documenter. It drives the update-mode **staleness throttle**: a source
  whose upstream SHA drifted is re-documented only once its docs are at least one week old, so a
  frequently-changing repo isn't re-documented on every run. Optional (omit on hand-edits — a
  missing date is treated as stale, i.e. eligible to re-document).
- Validated by `python -m scripts.lint_docs`.
