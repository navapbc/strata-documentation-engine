# Upstream source issues — to file against the source repos

**Advisory only. Nothing here changes engine behavior.** These are source-quality problems the
documentation engine correctly **flagged but did not propagate** into the generated docs (per the
`verified` audit trail and the curation report). They live in the *upstream* source repositories,
not in this engine — fixing them upstream gives future regenerations cleaner input. Kept as a
durable list separate from `improvements.md`, which the curator overwrites each run.

Last refreshed from the curation run recorded in `docs/.curation/improvements.md` (update-mode pass,
2026-06-29, over `oscer`, `strata-template-rules-engine-catala`, `strata-unemployment`,
`template-infra-azure`). `oscer` and `strata-unemployment` surfaced **no** upstream source defects to
file this run.

---

## template-infra-azure — `navapbc/template-infra-azure`

Pervasive **AWS-terminology drift** in the shipped docs, leftover from the upstream AWS template,
while the implementation is Azure (`azurerm` backends, Azure Container Apps / Container App Jobs,
Key Vault, Azure Storage blob, Virtual Networks):

- Leftover AWS terms in operational docs: `.s3.tfbackend`, "ECS task", "Lambda function", "S3",
  "VPC", "ECR".
- `set-up-database.md` step 4 says "role manager **Lambda function**" — it is actually a **Container
  App Job**.
- `environment-variables-and-secrets.md` references an **"ECS task definition"**, and names the file
  `environment_variables.tf` (underscore) — the real file is `environment-variables.tf` (dash,
  confirmed under `app-config/env-config/`).
- `making-infra-changes.md` / `destroy-infrastructure.md` show `*.s3.tfbackend`; the real backend
  files are `*.azurerm.tfbackend`.
- **Empty `bin/` directory.** The root `Makefile` and `infra/accounts/main.tf` reference many
  `./bin/*` scripts (`set-up-account`, `create-tfbackend`, `terraform-init-and-apply`,
  `account-ids-by-name`, `set-up-github`, …) but `bin/` is empty in the checkout — the scripts are
  not present anywhere in the repo.
- Shared-concern doc links (application-requirements, set-up-ci/cd, pr-environments, team-workflow)
  point at the **AWS** `navapbc/template-infra` repo rather than shipping Azure copies.
- `docs/README.md` is effectively empty (~1 line).
- `background-jobs.md` worker-queue jobs are "not yet implemented".

## strata-template-rules-engine-catala — `navapbc/strata-template-rules-engine-catala`

- `template/docs/{{app_name}}/getting-started.md.jinja` shows `poetry install --all-extras --with
  dev`, inconsistent with the template's extras layout: `pyproject.toml` uses PEP-621 extras, the
  Dockerfile uses `poetry install --no-root --extras dev`, and `make setup-local` uses `poetry
  install --no-root`. The getting-started line is likely stale and may not work as written.
- The README documents `nava-platform app install` but **no template-specific update command**
  (unlike documentai-api, whose README shows `app update`); the only update path is the general
  `nava-platform app update` via the platform-cli link.
- No `poetry.lock` is committed (Dockerfile uses a `poetry.lock*` glob), so dependency versions
  resolve at build time.

## documentai-api — `navapbc/strata-template-documentai-api`

- `README.md` links to `/template-only-docs/demployment.md` — a typo for `deployment.md` (broken
  link).
- Open TODOs in `deployment.md`: `DDE_` env-var aliasing, BDA region extraction.

## strata-sdk — `navapbc/strata-sdk-rails`

Stable docstring/code mismatches the docs carry as discrepancy notes:

- `BusinessProcess.define(...)` block form is documented but **not implemented** (only the subclass
  form exists).
- Name attribute has **four** components in code (first/middle/last/**suffix**); attribute/generator
  docs list only three.
- Address column naming: docs/example use `street_address_line_*` vs the code's `street_line_*`.
- Migration-generator USAGE lists `date_range` / `year_month` / `year_quarter` /
  `year_quarter_range` mappings the generator does **not** implement as branches.
- "Master Person Record" listed as a component with **no implementation** (documented as roadmap).

## app-template — `navapbc/template-application-rails`

- `auth_service.rb` raises `"Unsupported AUTH_SERVICE"` keyed off `config.auth_adapter`, while the
  env var is `AUTH_ADAPTER` (minor naming inconsistency).

## platform-cli — `navapbc/platform-cli`

- `app update`'s `src_path` has no effect on updates — **already filed upstream:**
  `navapbc/platform-cli#5`.

## template-infra — `navapbc/template-infra`

- Ships `feature_flags` and `storage` modules with **no dedicated `docs/infra/*` guide**, so the
  engine can only list them in the module-architecture child list. Request upstream guides — the
  engine must not invent capability claims for undocumented modules.
