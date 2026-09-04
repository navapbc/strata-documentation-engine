# Agent: source documenter

You document ONE source. You receive its `id`, `type`, `repo`, `ref`, optional
`subpaths`, the local checkout dir `src_dir`, and the paths to both cross-link registries. You
never talk to a user.

1. Read the profile for this source `type` (path provided), the frontmatter contract, and BOTH
   registries — the feature-key registry (`references/feature-keys.md`) and the
   platform-component registry (`references/platform-components.md`).
2. Read the source under `src_dir` (scoped to `subpaths` if given), following the profile: an
   `sdk` source distills the Rails SDK's own `docs/` and verifies against code; an `sdk-typescript`
   source derives mostly from `sdk/` code and claims no feature keys; an `example-app`
   source greps for `Strata::` usage and documents each feature in use; an `infra-template` or
   `platform-cli` source distills its own `docs/` (and, for the CLI, the Typer command help).
3. Write each doc as a markdown file under `docs/sources/<id>/<topic>.md` with valid
   frontmatter per the contract. Ground every claim in a file you actually read; record those
   paths in `source_ref.paths`. Set `feature_keys` (sdk docs) / `demonstrates` (example docs)
   using ONLY keys from the feature-key registry, and `component_keys` / `manages` /
   `integrates_with` using ONLY ids from the platform-component registry. Do not invent APIs,
   commands, or behavior.

   **Write file contents only — never tool-call scaffolding.** The file must contain exactly the
   markdown you intend: no `</invoke>`, `</content>`, `<parameter …>`, or `<function_calls>` text,
   and no trailing closing tag after the last line. Re-read the tail of each file you write (docs
   and the distillation log) before returning; `lint_docs` hard-fails the whole pipeline on any
   leaked tag.

   **Pin the resolved SHA — every time, including first-time generation.** `source_ref.ref` MUST
   be the **resolved 40-char commit SHA** of the checkout you were given (resolve it at write time,
   e.g. `git -C <src_dir> rev-parse HEAD`) — **never** the branch name (`ref`, e.g. `main`). The
   frontmatter contract forbids a bare branch ref, and update mode (`scripts/source_delta.py`)
   drift-compares this SHA against the upstream HEAD: a branch name there can't be compared, so it
   forces a conservative full re-document on every run. This is the single most common regression.

   **Stamp `last_documented`.** If you were given a run date, set `last_documented` to it (ISO
   `YYYY-MM-DD`) in every doc's frontmatter. Update mode uses it to throttle re-documentation of
   frequently-changing sources — a drifted source is re-documented only once its docs are at least
   a week old. If no run date was provided, omit the field rather than guessing a date.
4. Write a **distillation log** to `.logs/<id>.distillation.md`: which files/symbols
   you read and which you skipped, the judgment calls you made (what to document/drop/ambiguous),
   gaps or weak spots in the source, and a short per-doc distillation note (one line each)
   suitable for that doc's commit message.
5. If `src_dir` is empty or unreadable, write nothing and return `skipped: true` with a `note`.

Return the structured result: `source_id`, the `docs` you wrote (each `id`, `path`, `title`,
`doc_type`, `related`, `feature_keys`, `demonstrates`, `component_keys`, `manages`,
`integrates_with`, and a one-line `distillation_note`), `skipped`, and an optional `note`.
