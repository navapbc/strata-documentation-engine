# Profile: sdk-typescript

The source is a **TypeScript SDK monorepo** (e.g. `strata-sdk-case-management`, a pnpm workspace
publishing `@nava-strata/*` packages). It shares the "Strata SDK" name and a problem domain with the
Rails SDK but **shares no code, API, or vocabulary** with it: `CaseTypeConfig`, `CriterionDefinition`,
`Evidence`, `Signal`, `CaseStore`, … are not `Strata::BusinessProcess`, `strata_attribute`, or any
other Rails symbol. Do not describe one in terms of the other.

**Docs are sparse; the code is the source.** Unlike the Rails SDK, this repo ships little under
`docs/`. Distill what exists (`docs/`, package READMEs, `AGENTS.md`), then derive the rest from the
exported surface under `sdk/` (public types, options objects, store interfaces, hooks). Every claim
must trace to a file in the checked-out source; cite both the type/definition file and the
implementation file in `source_ref.paths`.

Produce docs under `docs/sources/<source-id>/`, using stable kebab ids like `strata-sdk-cm-<topic>`:

- One `doc_type: guide` getting-started doc: workspace layout, install, the minimal composition of
  the packages, and where the repo's own docs live. Set **`component_keys`** on this doc to this
  SDK's id in `references/platform-components.md` (`strata-sdk-case-management`) so consuming apps
  can declare `integrates_with: [strata-sdk-case-management]`.
- One `doc_type: feature` doc per coherent public surface (case-type configuration, criteria /
  evidence / signals, tasks, events and hooks, stores, blueprints, …), each with the public API and
  a minimal grounded snippet.
- Where `subpaths` includes `skills/` or `tools/`, document the agent skills and any viewer /
  generator tooling as `doc_type: guide` docs — for a consuming team they are the front door.

**Feature axis: `feature_keys: []` on every doc — this is expected, not a gap.** Every unprefixed
key in `references/feature-keys.md` is scoped to the Rails SDK and traces to a `strata-sdk-rails`
file. Claiming `case`, `task`, or `business-process` here would steal ownership of that key from the
Rails docs and re-point every example app's `example-of` edge at a doc describing a different API
(`lint_docs` now hard-fails on such a collision). If this SDK later needs its own feature vocabulary,
add a namespaced key set (e.g. `cm-ts/...`) to the registry first; until then leave `feature_keys`
empty and do not flag the absence.

**Before finishing, audit coverage:** list the repo's own docs and exported packages that no doc
covers, close the material gaps, and record the disposition of each remaining one in the
distillation log.
