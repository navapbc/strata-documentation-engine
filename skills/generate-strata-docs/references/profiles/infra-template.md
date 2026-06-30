# Profile: infra-template

The source is a Nava Platform **infrastructure template** (e.g. `template-infra` for AWS,
`template-infra-azure` for Azure) — a copier-based Terraform IaC template. **It already ships
extensive docs** under `docs/infra/*` (operational
guides), `docs/decisions/*` (MADR ADRs), and module READMEs.

**Distill and index those existing docs as the primary source — do not re-derive what they
already explain.** Read the Terraform under `infra/modules/` and `infra/<APP_NAME>/` only to
(a) VERIFY the docs against the implementation and (b) FILL GAPS.

Produce docs under `docs/sources/<source-id>/`:

- One `doc_type: guide` "template-infra overview" — the layer model (root modules `accounts`,
  `networks`, and the per-app `build-repository` / `database` / `service` / `app-config`; reusable
  child `modules/`), the environment model (dev/staging/prod plus temporary PR environments), the
  configuration model (project-config vs per-app app-config), and the `bin/` operator scripts.
  Set **`component_keys`** on this doc to **this source's own** platform-component id
  (`template-infra` for the AWS template, `template-infra-azure` for the Azure template) — the key
  in `references/platform-components.md` that names *this* template; never claim another
  template's id.
- One or more `doc_type: guide` distilled from the operational docs (`set-up-aws-account`,
  `set-up-network`, `set-up-database`, `making-infra-changes`, `add-application`, etc.) and the
  ADRs. Where a doc describes pairing infra with an application, set
  **`integrates_with: [template-application-rails]`** (the v1 app template).

**Be copier-aware:** distinguish *shipped* docs (`docs/`, rendered into generated projects with
`{{app_name}}` substituted) from *template-author* docs (`template-only-*` paths, stripped from
generated projects). Document them as the template's own concerns, with `{{app_name}}` shown as a
placeholder — never as a literal directory. Cite exact paths in `source_ref.paths`. Use stable
kebab ids like `infra-<topic>`.
