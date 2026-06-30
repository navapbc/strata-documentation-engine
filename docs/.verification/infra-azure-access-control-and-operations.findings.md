# Verification findings: infra-azure-access-control-and-operations (round 1)

Doc: docs/sources/template-infra-azure/infra-access-control-and-operations.md
Source: .sources/template-infra-azure

## Result

No unsupported, inaccurate, or outdated claims found. The doc is fully supported
by its eight cited source files.

Spot-checks performed:

- **Cloud access control** — `subscription_roles` in
  `infra/modules/auth-github-actions/main.tf`: matches cloud-access-control.md.
- **Database access control** — three Entra groups (DB Admin / Migrator / App),
  group-name-as-username + token-as-password, `az account get-access-token
  --resource-type oss-rdbms`, migrator/app Postgres roles: all match
  database-access-control.md.
- **Infra admin permissions** — Owner, Key Vault Administrator, RBAC
  Administrator, Storage Blob Data Contributor scoped to subscription; Cloud
  Application Administrator scoped to tenant: matches infra-admin-permissions.md.
- **Workspaces** — default vs non-default behavior (name prefixing, deletion
  protection disabled, DNS not created), init/new/show/apply/destroy/select
  command flow, short-name guidance: matches the workspaces doc. (Doc's
  `terraform ... delete <WORKSPACE_NAME>` reproduces the source's own wording on
  line 94 — not a doc-introduced error.)
- **Destroy** — reverse order, accounts module last, comment out `backend
  "azurerm"`, `terraform init -force-copy`, final `terraform destroy` in
  `infra/accounts`: matches destroy-infrastructure.md. Doc generalizes the
  source's `/infra/app/service` to `infra/<APP_NAME>/service`, a faithful
  templating generalization.
- **Compliance** — Checkov + tfsec, Homebrew install, `make
  infra-check-compliance`, optional pre-commit: matches compliance.md.
- **Vulnerability scanning** — `ci-vulnerability-scans` workflow, runs on PR push
  and merge to main when `app` changes, Hadolint/Trivy/Anchore(grype)/Dockle,
  ignore files `.hadolint.yaml`/`.trivyignore`/`.grype.yml`/`.dockleconfig` via
  `DOCKLE_ACCEPT_FILES`, multi-stage `FROM scratch AS release`: matches
  vulnerability-management.md.
- **Style** — HashiCorp guide + exceptions (logical module names, shared config
  vs tfe_outputs, underscores, type/unit-suffixed variables, plural lists,
  `values_by_key`, `enable_` prefix, no committed `.terraform.lock.hcl`,
  Terratest, tfsec for policy), GitHub Actions conventions, Google Shell Style
  Guide, `make infra-lint`: matches style-guide.md.
