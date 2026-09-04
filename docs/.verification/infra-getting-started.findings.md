# Verification findings: infra-getting-started (round 1)

Doc: `docs/sources/template-infra/infra-getting-started.md`
Source checkout: `.sources/template-infra` @ `8b7bc3899c3a9ab1b3441330d72993cd34d21f70`

## Summary

Re-verified every claim against the source at the SHA recorded in the doc's `source_ref`. All
substantive claims hold:

- Install / update commands (`nava-platform infra install .`, `nava-platform infra update .`) and the
  "read the release notes before updating" warning — `README.md`.
- Prerequisite framing (an application meeting the application requirements, deferrable via the
  example app) — `infra/README.md` "Getting started" step 1 and its Tip.
- Project config review warning, `networks.tf` with three networks (dev/staging/prod), and
  `main.tf.jinja` → `main.tf` rendering with project name / owner / code repository URL / default
  region — `infra/README.md`, `infra/project-config/networks.tf`, `infra/project-config/main.tf.jinja`.
- Tooling list (tfenv-managed Terraform, AWS CLI + `AWS_PROFILE`/direnv, Go for Terratest, `gh` for
  the auth check, optional shellcheck/actionlint/markdown-link-check) and `aws sts get-caller-identity`
  — `docs/infra/set-up-infrastructure-tools.md`; `.terraform-version` pins `1.10.5`.
- Account layer: `make infra-set-up-account`, the state bucket / OIDC provider / IAM role and policy,
  the `<account name>.<account id>.s3.tfbackend` file, and `make infra-check-github-actions-auth` —
  `docs/infra/set-up-aws-account.md`. GuardDuty-by-default in the default region —
  `infra/project-config/threat_detection.tf` (`enable_threat_detection = true`) and the
  `threat_detection` module in `infra/accounts/main.tf` (region = `project_config.default_region`).
- Network layer: `has_database` / `has_external_non_aws_service` driving VPC endpoints and NAT
  gateways, then `infra-configure-network` / `infra-update-network` — `docs/infra/set-up-network.md`.
- Build repository shared across environments (no `ENVIRONMENT` arg), plus the
  `gh workflow run build-and-publish.yml --field app_name=... --field ref=main` example —
  `docs/infra/set-up-app-build-repository.md`.
- Database layer optional, all four Make targets in the stated order, Aurora Serverless v2, role
  manager Lambda creating `app` and `migrator` — `docs/infra/set-up-database.md`; targets confirmed
  present in the root `Makefile`.
- Service layer: `infra-configure-app-service` then
  `TF_CLI_ARGS_apply="-var=image_tag=<IMAGE_TAG>" make infra-update-app-service`, and `has_database`
  gating database wiring — `docs/infra/set-up-app-env.md`.
- Production-launch checklist (HTTPS, custom domains, monitoring alerts, WAF, staging/prod) and the
  reuse/repeat guidance for account, VPC, and build repository — `infra/README.md`,
  `docs/infra/staging-and-production-environments.md`.
- Adding applications and the platform-cli guide link — `docs/infra/add-application.md`.
- The four remaining `template-only-docs/` guides (CI, CD, PR environments, team workflow) and that
  `template-only-*` content is not included in generated projects — `README.md` Setup Guide steps
  2-5 and its Documentation section.

## Findings

### 1. Placeholder notation for the app directory (low)

- **Claim**: "`{{app_name}}` below is a placeholder for your application's folder name under
  `infra/`", used later as `infra/{{app_name}}/app-config/main.tf`.
- **Issue**: The source guides consistently write this as `infra/<APP_NAME>/app-config/main.tf`, and
  the doc's own command examples use `APP_NAME=<APP_NAME>`. In this repo `{{app_name}}` is the
  copier-templated *application* directory at the repo root, not an `infra/` subdirectory, so
  borrowing that spelling for the infra path is mildly misleading and inconsistent within the doc.
- **Evidence**: `docs/infra/set-up-network.md` requirement 3 ("Configure the app in
  `infra/<APP_NAME>/app-config/main.tf`"), `docs/infra/set-up-app-env.md` line 35; repo root
  contains a literal `{{app_name}}/` directory.
- **Suggested fix**: Use `<APP_NAME>` throughout — replace the placeholder note with one about
  `<APP_NAME>` and change `infra/{{app_name}}/app-config/main.tf` to
  `infra/<APP_NAME>/app-config/main.tf`.

## Round 2 Findings

### 1. Source file path reference instead of generated doc cross-reference (low)

- **Claim (line 154)**: "see `docs/infra/staging-and-production-environments.md`"
- **Issue**: References a source file path instead of a generated doc cross-reference. Users reading the generated doc won't have access to this source path. The content is already properly cross-referenced two lines above as `[staging and production environments](infra-environments-and-workspaces.md)`.
- **Evidence**: Line 152 uses proper cross-reference syntax; line 154 uses backtick-quoted source path. The generated doc `infra-environments-and-workspaces.md` covers this content via source file `docs/infra/staging-and-production-environments.md` in its `source_ref`.
- **Suggested fix**: Remove or replace the backtick-quoted source path on line 154. The proper cross-reference on line 152 is sufficient.

### 2. Source file path reference without generated doc context (low)

- **Claim (line 159)**: "To add one (`docs/infra/add-application.md`)"
- **Issue**: References a source file path in running text. No generated doc equivalent exists in the docs structure, and unlike the template-only-docs guidance (lines 167-170), this reference lacks explanation that users should find it on the template's GitHub page.
- **Evidence**: Line 159 parenthesizes `docs/infra/add-application.md`. Lines 167-170 explicitly state template-only-docs are not included and direct users to GitHub. No corresponding `infra-add-application.md` in generated docs folder.
- **Suggested fix**: Add clarifying text that this is a template source file and direct users to the template's GitHub page, consistent with the template-only-docs guidance pattern.
