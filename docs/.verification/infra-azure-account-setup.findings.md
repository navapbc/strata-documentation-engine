# Verification findings: infra-azure-account-setup (round 1)

Doc: `docs/sources/template-infra-azure/infra-account-setup.md`
Source: `.sources/template-infra-azure`

## Result: no findings

Every claim in the doc is supported by the source checkout. Items spot-checked:

- Account = Subscription terminology, and the three things account setup does (Terraform
  backend storage, GitHub OIDC provider in Entra tenant, ACR only for shared account) —
  confirmed against `docs/infra/set-up-azure-account.md`.
- ACR gating on `is_shared_subscription` — confirmed in `infra/accounts/container_registry.tf`
  (`container_registry_resource` has `count = local.is_shared_subscription ? 1 : 0`).
- Required admin roles (Owner, Key Vault Administrator, RBAC Administrator, Storage Blob Data
  Contributor at Subscription scope; Cloud Application Administrator at tenant scope) —
  confirmed against `docs/infra/infra-admin-permissions.md`.
- `make infra-set-up-account ACCOUNT_NAME=... [args=<SUBSCRIPTION_ID>]`,
  `make infra-update-current-account`, `make infra-update-account ACCOUNT_NAME=...` —
  all confirmed in `Makefile`.
- `terraform -chdir=infra/accounts output github_oidc`, copying client_id/object_id into
  `github_actions_azure_config`, and `infra_admins` guidance — confirmed against the source doc.
- Admin-consent step, `az ad app permission admin-consent --id <app id>`, and the
  `azuread_app_role_assignment` block to uncomment — confirmed against the source doc and the
  commented block in `infra/modules/auth-github-actions/main.tf`.
- `./bin/set-up-github` and `bin/check-github-actions-auth` references, GitHub CLI / tooling
  prerequisites — confirmed against `docs/infra/set-up-github.md` and
  `docs/infra/set-up-infrastructure-tools.md` (Go/Terratest, tfenv, azure-cli, jq, linters).
- `subscription_roles` listed in `infra/modules/auth-github-actions/main.tf` and the OIDC trust
  being an `azuread_application_federated_identity_credential` — confirmed in that file. The doc
  correctly calls `subscription_roles` a *local* (the source's `cloud-access-control.md`
  imprecisely calls it a "variable", so the doc is actually more accurate than the source).

## Note (not a finding)

The doc references `infra/project-config/main.tf` for `github_actions_azure_config` /
`infra_admins`. The repo's actual file is `infra/project-config/main.tf.jinja` (a template).
However, the source doc `docs/infra/set-up-azure-account.md` itself refers to
`/infra/project-config/main.tf`, so the doc faithfully reproduces the source's own wording.
This is a source-level imprecision, not a doc-vs-source defect, so it is not raised as a finding.
