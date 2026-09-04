---
id: infra-azure-access-control-and-operations
title: Access control, workspaces, and operations
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, access-control, entra, workspaces, compliance, security, operations, teardown]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service, infra-azure-making-changes]
summary: Cloud and database access control, the infra-admin Entra permissions needed to run Terraform, isolated development with Terraform workspaces, tearing infrastructure down, and the compliance, vulnerability, and style checks the Azure infra template ships with.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - docs/infra/cloud-access-control.md
    - docs/infra/database-access-control.md
    - docs/infra/infra-admin-permissions.md
    - docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md
    - docs/infra/destroy-infrastructure.md
    - docs/compliance.md
    - docs/infra/vulnerability-management.md
    - docs/infra/style-guide.md
    - docs/code-reviews.md
    - infra/modules/auth-github-actions/main.tf
    - infra/accounts/container_registry.tf
    - infra/accounts/shared_hosted_zone.tf
    - .github/workflows/ci-{{app_name}}-vulnerability-scans.yml.jinja
    - .github/workflows/vulnerability-scans.yml
    - infra/modules/database/resources/main.tf
    - infra/modules/terraform-backend-azure/main.tf
    - infra/{{app_name}}/service/main.tf
    - infra/{{app_name}}/service/secrets.tf
    - infra/modules/storage/main.tf
    - Makefile
last_documented: 2026-09-04
verified: ok
---

# Access control, workspaces, and operations

This guide collects the cross-cutting operational concerns of the Azure infra template: who can touch
what (cloud, database, and admin access), how to develop changes in isolation, how to tear
infrastructure down, and the compliance, security, and style checks the template ships with.

## Cloud access control

GitHub Actions needs permission to create, modify, and destroy resources in the cloud account as
part of the CI/CD workflows. In the current Azure setup the GitHub Actions identity is given **broad
access** to subscription resources, listed in the `subscription_roles` variable in
`infra/modules/auth-github-actions/main.tf` (Source: `docs/infra/cloud-access-control.md`). Those
roles, each assigned at subscription scope, are:

- `Contributor` — control-plane access to most things, but cannot assign roles,
- `Key Vault Secrets Officer` — read/write the service secrets themselves,
- `Key Vault Certificates Officer` — read/write certificate secrets,
- `Role Based Access Control Administrator` — read/create service and DB user groups (close to
  `Owner`).

Separately, the identity gets `Storage Blob Data Contributor` scoped to the Terraform state
container, the Microsoft Graph `Group.Read.All` application permission (which needs tenant admin
consent — see [account setup](infra-set-up-account-and-network.md)), and, in non-shared
subscriptions, `Contributor` on the shared container registry and `DNS Zone Contributor` on the
shared DNS zone. Authentication is via a federated identity credential subject-scoped to
`repo:<org>/<repo>`, so no secrets are stored in GitHub.

## Database access control

All database access authenticates via [Entra
ID](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication),
so there are **no long-lived credentials** to store and manage. Provisioning a database creates three
Entra ID groups that the relevant service principals or users are placed into
(`docs/infra/database-access-control.md`):

- a "DB Admin" group,
- a "Migrator" group,
- an "App" group.

When connecting, the **group name is the username and a generated token is the password**. Anyone in
the DB Admin group can connect as an administrator; if your currently authenticated user is in that
group, get the token with:

```bash
az account get-access-token --resource-type oss-rdbms
```

The role manager, running as an admin, creates the Postgres roles: **`migrator`** (assumed by the
migration task, which runs as part of the deploy workflow before the new image is deployed; may
create tables in the `app` schema) and **`app`** (assumed by the application service; read/write in
the `app` schema). The Terraform sets `password_auth_enabled = false` on the flexible server, with a
comment explaining that if you do want password auth for alternative access you must do the first
deploy with it disabled so databases are owned by the Entra admin the role manager expects. See
[set up the database](infra-set-up-database-and-service.md) for the provisioning steps and the
default-privileges gotcha.

## Infra admin permissions

To run Terraform — including the initial Azure subscription setup — your own account needs several
role assignments in the appropriate Microsoft Entra ID tenant. Alternative permission setups are
possible; this is the combination that has been tested (`docs/infra/infra-admin-permissions.md`).

Scoped to the relevant subscription(s), without conditions limiting their application:

- Owner
- Key Vault Administrator
- Role Based Access Control Administrator
- Storage Blob Data Contributor

Scoped to the Microsoft Entra ID tenant itself:

- Cloud Application Administrator — needed to register the GitHub Actions identity. The doc notes
  this requirement could be removed by
  [future work](https://github.com/navapbc/template-infra-azure/issues/17).

## Develop and test in isolation with Terraform workspaces

When developing infrastructure code you usually want to test changes in isolation so that your
changes don't affect other engineers, other engineers don't revert your changes while making their
own, and reviewers can look at the change before it is applied. The template's answer is
[Terraform workspaces](https://developer.hashicorp.com/terraform/language/state/workspaces)
(`docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md`).

By default each root module has a single workspace named `default`. Applying in a separate workspace
creates a parallel set of resources without configuring a new backend. Three differences apply in a
non-default workspace:

1. **Resource names are prefixed with the workspace name**, because Terraform cannot create two
   resources with the same name (the apply would fail with "A resource with the ID already exists").
2. **Deletion protection is disabled** on resources such as databases and storage, since non-default
   workspaces are meant to be temporary.
3. **Resources that are difficult to create in isolation, such as DNS records, are not created at
   all.**

In this template the mechanism is `local.is_temporary = terraform.workspace != "default"` in the
service and database root modules, which additionally skips creating the per-service resource group
and secrets Key Vault (they are looked up with data sources instead), suffixes generated secret names
with the workspace name so temporary environments don't clobber real ones, keeps manually managed
secrets shared, disables blob versioning and shortens soft-delete retention to a day, and skips the
private endpoints. The same flag is what makes PR preview environments possible.

Workflow for the service layer — adjust the `-chdir` flag for another layer such as database or
network:

```bash
# 1. Init the root module against the dev environment
terraform -chdir=infra/<APP_NAME>/service init -reconfigure -backend-config=dev.azurerm.tfbackend

# 2. Create and select a short-named workspace (your initials work well; the name prefixes
#    resource names, so long names hit Azure resource-name length limits)
terraform -chdir=infra/<APP_NAME>/service workspace new <WORKSPACE_NAME>
terraform -chdir=infra/<APP_NAME>/service workspace list   # selected workspace is marked with *
terraform -chdir=infra/<APP_NAME>/service workspace show   # or just show the current one

# 3. Create resources in your workspace
terraform -chdir=infra/<APP_NAME>/service apply -var=environment_name=dev
# or: make infra-update-app-service "APP_NAME=<APP_NAME>" ENVIRONMENT=dev

# 4. After merging your PR and deploying to the default workspace, clean up so you stop
#    accruing costs
terraform -chdir=infra/<APP_NAME>/service destroy -var=environment_name=dev
terraform -chdir=infra/<APP_NAME>/service workspace select default   # can't delete the selected one
terraform -chdir=infra/<APP_NAME>/service workspace delete <WORKSPACE_NAME>
```

> The shipped doc's final command reads `terraform -chdir=... delete <WORKSPACE_NAME>`, missing the
> `workspace` subcommand. The corrected form is used above.

## Destroy infrastructure

To destroy everything, undeploy the layers in the **reverse** order they were created — the account
root module(s) must go **last**, because they hold the Terraform state storage
(`docs/infra/destroy-infrastructure.md`):

1. Destroy each application environment:

   ```bash
   TF_CLI_ARGS_apply="-destroy" make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
   ```

2. Do the same for every app database (`infra-update-app-database`) and then every network
   (`infra-update-network`).
3. Because you are about to destroy the tfstate storage location, move the account state back to your
   local system first. Comment out or delete the `backend "azurerm"` block in
   `infra/accounts/main.tf`.
4. From within `infra/accounts`, copy the remote state back to a local `tfstate` file:

   ```bash
   terraform init -force-copy
   ```

5. Finally destroy the account layer:

   ```bash
   TF_CLI_ARGS_apply="-destroy" make infra-update-account ACCOUNT_NAME=<ACCOUNT_NAME>
   ```

Be aware that some resources resist deletion by design: the Terraform backend storage account keeps
30-day blob and container soft-delete retention, and the backend Key Vault (created when the
customer-managed encryption key is enabled) sets `purge_protection_enabled = true`
(`infra/modules/terraform-backend-azure/main.tf`).

## Compliance, vulnerability, and style checks

- **Compliance.** Static analysis with [Checkov](https://www.checkov.io/) and
  [tfsec](https://aquasecurity.github.io/tfsec/). Install both with Homebrew, then run
  `make infra-check-compliance` (which runs `infra-check-compliance-checkov` — `checkov --directory
  infra` — and `infra-check-compliance-tfsec` — `tfsec infra`). If you use
  [pre-commit](https://www.checkov.io/4.Integrations/pre-commit.html) you can optionally add Checkov
  to your own hook. Note that the Terraform carries a number of inline
  `# checkov:skip=...` and `# tfsec` suppressions with rationale, several of which are explicit TODOs
  around disabling public network access on Key Vaults and the state storage account. (Source:
  `docs/compliance.md`.)
- **Container vulnerability scanning.** A per-app `ci-<app_name>-vulnerability-scans` GitHub
  workflow (generated from `.github/workflows/ci-{{app_name}}-vulnerability-scans.yml.jinja`) scans
  Docker images for vulnerabilities before they are pushed; it calls the reusable
  `.github/workflows/vulnerability-scans.yml`, which holds the scan jobs. The shipped doc calls it
  `ci-vulnerability-scans`, a stale name. It triggers on pull requests and on pushes to `main`
  whenever the app directory, any scanner config file (`.grype.yml`, `.hadolint.yaml`,
  `.trivyignore`), or either workflow file changes (scanning both times, because a CVE can appear
  between a Friday approval and a Monday merge). It runs **Hadolint**, **Trivy**, **Anchore/grype**,
  and **Dockle**, each with an ignore or allow file resolved by the `./.github/actions/first-file`
  action, which prefers a per-app copy at `<app_name>/<file>` and falls back to the repo root:
  `.hadolint.yaml`, `.trivyignore` (plus `trivy-secret.yaml`), `.grype.yml` (configured to ignore
  findings in state `not-fixed`, `wont-fix`, and `unknown`), and `.dockleconfig`. Dockle has no
  ignore-file support, so a prior step greps the `DOCKLE_ACCEPT_FILES=` line out of the resolved
  Dockle config and appends it to `$GITHUB_ENV` — which allows *files*, not finding types. The doc
  recommends a multi-stage Dockerfile ending in `FROM scratch AS release` that copies only the built
  artifacts, to shrink the image and reduce findings. (Source:
  `docs/infra/vulnerability-management.md`.)
- **Style.** Terraform follows [HashiCorp's style
  guide](https://developer.hashicorp.com/terraform/language/style) with template-specific exceptions
  (`docs/infra/style-guide.md`): name modules by logical function rather than the underlying service
  (`database`, not `rds`; `storage`, not `s3`); organize resources by infrastructure layer; use
  shared configuration instead of the `tfe_outputs` data source to share state between state files;
  use underscores rather than dashes in file and module names, and lowercase filenames; suffix string
  variables with their type (`access_policy_arn`, not `access_policy`) and numeric variables with
  their unit (`max_request_seconds`); use plural nouns for lists (`subnet_ids`), `values_by_key` for
  maps (`account_ids_by_name`), and an `enable_` prefix for boolean feature flags; do **not** commit
  `.terraform.lock.hcl`; use [Terratest](https://terratest.gruntwork.io/docs/) rather than the
  Terraform test framework; and use tfsec rather than Terraform's policy enforcement framework. The
  guide also covers GitHub Actions conventions (job names of at most three words, imperative step
  names, a single-space job name when calling a reusable workflow, blank lines between jobs and
  steps) and points shell scripts at [Google's Shell Style
  Guide](https://google.github.io/styleguide/shellguide.html). Run the linters locally with
  `make infra-lint` (markdown link check, shellcheck, `terraform fmt -check`, and actionlint) and fix
  formatting with `make infra-format`.
- **Code review.** `docs/code-reviews.md` sets team expectations: reviewers respond within one
  business day, highlight what they like, mark feedback as preference / consideration / error, and
  err on the side of trust (approve when only minor changes remain, reserve "request changes" for
  blocking issues); authors keep PRs small enough to review in one to two business days, split out
  refactors, treat the PR description as documentation, use draft PRs for work in progress, and
  re-request review after addressing comments.
