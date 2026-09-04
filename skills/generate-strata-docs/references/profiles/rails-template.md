# Profile: rails-template

The source is a project template (e.g. the Rails application template). Document
**how to use the template** and **worked examples of standing up a new project**.

Produce docs under `docs/sources/<source-id>/`:

- One `doc_type: guide` "Using the <template>" — prerequisites, the generate/bootstrap
  command(s), what the template scaffolds, and how to configure it. Ground every command in
  the template's README, generator scripts, and config. This guide — and only this guide — sets
  **`component_keys: [template-application-rails]`**; the example docs leave `component_keys`
  empty so the id has exactly one owner (`lint_docs` fails on a second claimant).
- One or more `doc_type: example` "Setting up a new <kind> project" — a concrete end-to-end
  walkthrough an engineer can follow to create a brand-new project, including the exact
  commands and the resulting structure.

**`integrates_with` for the guide names both infra templates** — `template-infra` and
`template-infra-azure` — whenever the template ships Azure/Entra ID DB-auth support (e.g.
`config/initializers/database_auth.rb`, an Azure section in `Deployment.md`). An AWS-only
walkthrough example is free to name just `template-infra`. Do not re-decide this per run.

An empty `template-only-docs/README.md` is expected copier-family boilerplate; skip it without
flagging it as a gap.

Cite the template files each step relies on in `source_ref.paths`. Prefer copying real
commands from the source over paraphrasing.
