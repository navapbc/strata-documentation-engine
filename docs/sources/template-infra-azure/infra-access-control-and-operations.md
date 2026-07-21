---
id: infra-azure-access-control-and-operations
title: Access control, workspaces, and operations
source: template-infra-azure
verified: ok
doc_type: guide
tags: [infra, azure, terraform, access-control, entra, workspaces, compliance, security, operations]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service]
summary: Cloud and database access control, infra-admin Entra permissions, isolated development with Terraform workspaces, tearing down infrastructure, and the compliance/vulnerability/style checks for the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: e10a383c4871d6eab3999baf63a01e5bd5a81f4c
  paths:
    - docs/infra/cloud-access-control.md
    - docs/infra/database-access-control.md
    - docs/infra/infra-admin-permissions.md
    - docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md
    - docs/infra/destroy-infrastructure.md
    - docs/compliance.md
    - docs/infra/vulnerability-management.md
    - docs/infra/style-guide.md
    - infra/modules/auth-github-actions/main.tf
last_documented: 2026-07-21
---

# Access control, workspaces, and operations

This guide collects the cross-cutting operational concerns of the Azure infra template: who can
touch what (cloud, database, and admin access), how to develop changes in isolation, how to tear
infrastructure down, and the compliance/security/style checks the template ships with.

## Cloud access control

GitHub Actions needs permissions to create, modify, and destroy resources as part of CI/CD. In the
current Azure setup the GitHub Actions identity is granted broad access to subscription resources,
defined by the `subscription_roles` list in `infra/modules/auth-github-actions/main.tf` (assigned via
an `azurerm_role_assignment` per role). (Source: `docs/infra/cloud-access-control.md`,
`infra/modules/auth-github-actions/main.tf`.)

## Database access control

All database access authenticates via Microsoft Entra ID, so there are no long-lived stored
credentials. Provisioning a database creates three Entra ID groups — **DB Admin**, **Migrator**, and
**App**; relevant service principals or users are placed in the appropriate group. To connect, use
the **group name as the username and a generated token as the password**. A DB Admin can obtain a
token with:

```bash
az account get-access-token --resource-type oss-rdbms
```

The role manager (running as admin) creates two Postgres roles: **`migrator`** (assumed by the
migration task; can create tables in the `app` schema) and **`app`** (assumed by the service;
read/write in the `app` schema). (Source: `docs/infra/database-access-control.md`. See also
[set up the database](infra-azure-set-up-database-and-service.md).)

## Infra admin permissions

To run Terraform — including initial subscription setup — your account needs the following Entra ID
role assignments (this is the tested setup; alternatives are possible)
(`docs/infra/infra-admin-permissions.md`):

Scoped to the relevant subscription(s), without conditions:

- Owner
- Key Vault Administrator
- Role Based Access Control Administrator
- Storage Blob Data Contributor

Scoped to the Microsoft Entra ID tenant itself:

- Cloud Application Administrator — needed to register the GitHub Actions identity (a requirement
  that future work could remove).

## Develop and test in isolation with Terraform workspaces

To develop infra changes without affecting teammates (and to allow peer review before applying), use
[Terraform workspaces](https://developer.hashicorp.com/terraform/language/state/workspaces). Each
root module has a single `default` workspace; a non-default workspace deploys a parallel set of
resources without configuring a new backend. Notable differences in a non-default workspace
(`docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md`):

- Resource names are prefixed with the workspace name to avoid "resource already exists" conflicts.
- Deletion protection (e.g. on databases and storage) is disabled, since non-default workspaces are
  meant to be temporary.
- Resources that are hard to create in isolation (e.g. DNS records) are not created at all.

Workflow for the service layer (adjust `-chdir` for other layers):

```bash
# 1. Init the root module against the dev environment, then create a short-named workspace
terraform -chdir=infra/<APP_NAME>/service init -reconfigure -backend-config=dev.s3.tfbackend
terraform -chdir=infra/<APP_NAME>/service workspace new <WORKSPACE_NAME>   # e.g. your initials
terraform -chdir=infra/<APP_NAME>/service workspace show                  # verify selection

# 2. Create resources in your workspace
terraform -chdir=infra/<APP_NAME>/service apply -var=environment_name=dev
# or: make infra-update-app-service "APP_NAME=<APP_NAME>" ENVIRONMENT=dev

# 3. After merging and deploying to the default workspace, clean up to stop accruing cost
terraform -chdir=infra/<APP_NAME>/service destroy -var=environment_name=dev
terraform -chdir=infra/<APP_NAME>/service workspace select default
terraform -chdir=infra/<APP_NAME>/service delete <WORKSPACE_NAME>
```

Use a short workspace name (initials work well) to avoid hitting Azure resource name length limits.
(The workspace-isolation doc's example commands use the AWS-style `dev.s3.tfbackend` name; on Azure
the actual backend files follow the `azurerm` naming from the overview.)

## Destroy infrastructure

Tear everything down in **reverse** order of creation — the account root module(s) go **last**
(`docs/infra/destroy-infrastructure.md`):

1. Destroy each environment from `infra/<APP_NAME>/service` (init with the environment's
   `.tfbackend`, then `terraform destroy`), repeat for `infra/<APP_NAME>/database` and all networks.
2. Because you are about to destroy the state storage, move the account state local first: comment
   out / delete the `backend "azurerm"` block in `infra/accounts/main.tf`, then from
   `infra/accounts` run `terraform init -force-copy` to copy state back to a local `tfstate`.
3. Finally run `terraform destroy` in `infra/accounts`.

## Compliance, vulnerability, and style checks

- **Compliance:** static analysis with [Checkov](https://www.checkov.io/) and
  [tfsec](https://aquasecurity.github.io/tfsec/). Install via Homebrew, then run
  `make infra-check-compliance` (which runs both; sub-targets `infra-check-compliance-checkov` and
  `infra-check-compliance-tfsec` exist). Optionally add Checkov to a pre-commit hook. (Source:
  `docs/compliance.md`.)
- **Container vulnerability scanning:** a `ci-vulnerability-scans` GitHub workflow scans Docker
  images before they are pushed (on PR pushes and on merge to `main`, when the `app` directory
  changes). It runs Hadolint, Trivy, Anchore (grype), and Dockle. Each scanner has an ignore/allow
  file at the repo root: `.hadolint.yaml`, `.trivyignore`, `.grype.yml`, and `.dockleconfig` (Dockle
  uses an accept-files list, piped in via `DOCKLE_ACCEPT_FILES`). The doc recommends a multi-stage
  Dockerfile ending in `FROM scratch AS release` to minimize the release image's attack surface.
  (Source: `docs/infra/vulnerability-management.md`.)
- **Style:** Terraform code follows [HashiCorp's style
  guide](https://developer.hashicorp.com/terraform/language/style) with template-specific exceptions
  — name modules by logical function (`database`, not `rds`); use shared config instead of
  `tfe_outputs` to share state; underscores (not dashes) in file and module names; type-suffixed
  variable names (`_id`, `_arn`, `_name`), unit-suffixed numerics, plural list names, `values_by_key`
  map names, and `enable_` boolean prefixes; do **not** commit `.terraform.lock.hcl`; use Terratest
  rather than the Terraform test framework; use tfsec for policy. The guide also covers GitHub Actions
  conventions (short job names, imperative step names, blank-line separation) and points shell scripts
  at [Google's Shell Style Guide](https://google.github.io/styleguide/shellguide.html). Run linters
  locally with `make infra-lint`. (Source: `docs/infra/style-guide.md`.)
