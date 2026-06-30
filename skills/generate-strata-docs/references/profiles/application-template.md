# Profile: application-template

The source is a copier-based **application template** (any stack — e.g. Python/FastAPI, Flask,
Next.js) that an engineer instantiates to scaffold a new application. Some of these templates are
**deployable Strata capabilities / sidecar services** — for example the DocumentAI template, a
sidecar deployed alongside a host app (e.g. a Rails app) that ingests uploaded documents and
classifies/extracts their data (e.g. W2, payslip) via AWS Bedrock Data Automation (BDA) + S3 +
DynamoDB.

Make the capability **discoverable**: the docs must convey that it exists, what problem it solves,
and that it can be deployed by Strata — not just the copier mechanics. The template is not itself a
deployed app and may not consume the Strata SDK.

Produce docs under `docs/sources/<source-id>/`:

- One `doc_type: guide` **capability overview** — what the capability is and the problem it solves,
  how it fits the Strata ecosystem (e.g. a deployable sidecar that runs alongside an application),
  and when to reach for it. This is the discoverability entry point.
- One `doc_type: guide` "Using / deploying the <template>" — prerequisites, the supported install
  path: the **`nava-platform app install` / `nava-platform app update`** commands as documented in
  the README (these templates route users through the `nava-platform` CLI, **not** raw `copier
  copy`, even though they are copier-based underneath). Record the variables the template prompts
  for separately (read `copier.yml`). Then cover what the `template/` tree scaffolds, the app's
  stack, and how to run / deploy it (for a sidecar, how to deploy it beside the host app). Ground
  every command in the README, `copier.yml`, Makefile, and scripts.
- Optionally one `doc_type: example` "Setting up a new <kind> project" — the exact command, the
  answers to each prompt, and the resulting project structure.

**Be copier-aware:** distinguish *shipped* template files (under `template/`, rendered into
generated projects with `{{var}}` substituted) from *template-author* files (`template-only-*`
paths, stripped from generated projects). Show `{{app_name}}` (etc.) as a placeholder — never as a
literal directory. Cite exact paths in `source_ref.paths`. Prefer copying real commands over
paraphrasing. Use stable kebab ids.

**Platform-axis tagging** (so the capability links into the graph instead of being an island):

- When the template is a deployable Strata capability / sidecar, set **`component_keys: [<its own
  key>]`** on the capability-overview doc (the key must already exist in
  `references/platform-components.md`) so it becomes a discoverable node.
- Set **`integrates_with: [..]`** to the app/platform component(s) the sidecar deploys beside (e.g.
  `template-application-rails`), using keys from `references/platform-components.md`.
- A generic full-app scaffold that is not a shared capability may set no platform-axis tags.
