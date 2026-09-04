---
id: infra-environments-and-workspaces
title: Environments, Workspaces, and Temporary Environments
source: template-infra
doc_type: guide
tags: [infra, environments, workspaces, pull-request-environments, terraform, deployment]
related: [infra-overview, infra-module-architecture, infra-getting-started, infra-database, infra-security-monitoring]
integrates_with: [template-application-rails]
summary: The standing dev/staging/prod environments plus the temporary environments — Terraform workspaces, per-pull-request environments, and how out-of-band resources are shared or excluded.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - infra/README.md
    - docs/infra/staging-and-production-environments.md
    - docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md
    - docs/infra/pull-request-environments.md
    - docs/infra/temporary-environments-and-out-of-band-resources.md
    - docs/infra/destroy-infrastructure.md
    - docs/infra/deletion-protection-and-temporary-environments.md
    - infra/modules/database/resources/main.tf
    - infra/modules/service/load_balancer.tf
    - infra/modules/storage/main.tf
    - infra/modules/storage/variables.tf
last_documented: 2026-09-04
verified: ok
---

# Environments, Workspaces, and Temporary Environments

The template distinguishes **standing** environments (dev/staging/prod) from **temporary**
environments (workspaces, PR environments, CI end-to-end environments). This doc distills that model
from `infra/README.md` and the `docs/infra` guides. `{{app_name}}` is a placeholder.

## Standing environments: dev, staging, prod

A project has `dev`, `staging`, and `prod` environments that share the same root modules but use
different configuration and a different S3 backend each (`infra/README.md`). Backends are bound via
`.tfbackend` files: per-environment files are named after the environment (`dev.s3.tfbackend`);
shared resources (the build repository) use `shared.s3.tfbackend`; account-wide resources use
`<account name>.<account id>.s3.tfbackend`.

### Adding staging and production

Per `docs/infra/staging-and-production-environments.md`, projects choose an account/VPC strategy:

- **Accounts:** either all non-prod environments share one account and prod gets a dedicated account,
  or every environment gets its own account. For separate accounts, repeat the account setup per
  account.
- **VPCs:** either all environments in an account share one VPC (staging can skip VPC setup and reuse
  dev's), or each environment gets its own VPC.

You can always reuse the build repository across environments. Repeat the database and service setup
for each environment, and in `staging.tf` / `prod.tf` confirm `network_name`, tune
`service_cpu` / `service_memory` / `service_desired_instance_count` for expected load, and set
`domain_name` once custom domains are configured.

## Temporary environments

Per `docs/infra/temporary-environments-and-out-of-band-resources.md`, the template supports three
kinds of short-lived environments:

- **Workspace-based** — created manually with Terraform workspaces for isolated development.
- **PR environments** — created/destroyed automatically by GitHub Actions per pull request.
- **CI end-to-end** — created and torn down per application by the `ci-<APP_NAME>-infra-service.yml`
  workflow on pull requests and on merges to the primary branch: it deploys the infrastructure,
  checks that the new service instance starts up, then tears it all down. The test code lives in
  `infra/test/`.

### Workspaces for isolated development

By default each root module has a single `default` workspace. A non-default workspace deploys a
parallel set of resources without configuring a new backend
(`docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md`). Notable behaviors in
non-default workspaces:

- Resource names are **prefixed with the workspace name** to avoid "resource already exists" errors.
- Deletion protection (databases, load balancers, storage buckets) is **disabled**, since these
  environments are temporary — see the `is_temporary` convention below.
- Resources that are hard to create in isolation, such as **DNS records**, are **not created**.

### The `is_temporary` convention

Per `docs/infra/deletion-protection-and-temporary-environments.md`, "temporary" is defined purely by
the Terraform workspace. Each root module computes

```hcl
locals {
  # All non-default terraform workspaces are considered temporary.
  is_temporary = terraform.workspace != "default"
}
```

and passes it to every child module that manages a deletion-protected resource. Each such module
declares `variable "is_temporary"` with `default = false`, so resources are protected unless
explicitly marked temporary, and applies it according to the resource's own attribute:

```hcl
enable_deletion_protection = !var.is_temporary          # ALB
deletion_protection        = !var.is_temporary          # Aurora cluster
force_destroy              = var.is_temporary           # S3
deletion_protection        = var.is_temporary ? "INACTIVE" : "ACTIVE"   # Cognito user pools
```

By convention the attribute goes on its own line under the comment
`# Use a separate line to support automated terraform destroy commands`, so the pattern is
greppable; `grep -r is_temporary infra/` finds every resource using it (for example
`aws_s3_bucket.storage` in `infra/modules/storage/main.tf`).

If a deletion-protected resource skips this convention, the automated cleanup paths that run
`terraform destroy` in a non-default workspace fail: the PR-environment destroy workflow, a
developer's own workspace teardown, and the CI infrastructure checks. Failed destroys leave orphaned
AWS resources accruing cost and causing later name collisions.

Typical workflow for a service-layer change:

```bash
terraform -chdir=infra/<APP_NAME>/service init -reconfigure -backend-config=dev.s3.tfbackend
terraform -chdir=infra/<APP_NAME>/service workspace new <WORKSPACE_NAME>   # e.g. your initials
terraform -chdir=infra/<APP_NAME>/service apply -var=environment_name=dev
# ... after merge + deploy to the default workspace, clean up:
terraform -chdir=infra/<APP_NAME>/service destroy -var=environment_name=dev
terraform -chdir=infra/<APP_NAME>/service workspace select default
terraform -chdir=infra/<APP_NAME>/service workspace delete <WORKSPACE_NAME>
```

### Pull request environments

A temporary environment is created when a PR is opened/reopened, updated on new commits, and
destroyed when the PR is merged or closed (`docs/infra/pull-request-environments.md`). The endpoint
and deployed commit are posted to the PR description. PR environments enable stakeholder review,
end-to-end tests, accessibility checks, and workspace creation for service-layer changes.

PR environments **share the dev environment's database and Cognito user pool** rather than
provisioning their own, which speeds provisioning and reuses test data/accounts. Consequences:

- Configuration changes to shared resources (database, identity provider) are **not** testable in a
  PR environment — they take effect only after merge to dev.
- Multiple PR environments share the same resource instances, so their data can be mutually visible.
- **Database migrations from the PR branch are not run** against the shared dev database. Isolate
  schema changes into their own PR and merge them first, so application PRs that depend on them stay
  functional and testable.

PR environments are implemented with two reusable workflows — `pr-environment-checks.yml`
(create/update) and `pr-environment-destroy.yml` (destroy) — wired up per application via
`ci-<APP_NAME>-pr-environment-checks.yml` and `ci-<APP_NAME>-pr-environment-destroy.yml`.

### How temporary environments handle out-of-band resources

An **out-of-band resource** has a lifecycle that involves steps outside Terraform — external
coordination (e.g. DNS NS records at a registrar), long provisioning (a database takes 20–40 min),
shared valuable state (seed data, test accounts), or global uniqueness constraints
(`docs/infra/temporary-environments-and-out-of-band-resources.md`). The template handles them two
ways:

- **Sharing** — temporary environments point at an existing instance. *Cross-layer:* service-layer
  temporary environments use the database from the database layer. *Same-layer:* non-default
  workspaces share the default workspace's Cognito pool. Used for the **database** and the
  **identity provider**.
- **Exclusion** — the Terraform config detects a non-default workspace and skips the resource
  entirely. Used for **DNS records / custom domains** and resources with external approval workflows;
  these environments are reached via their default AWS URLs instead.

When adding a new out-of-band resource, the decision is: if it holds valuable shared state, share it;
else if the application can function without it, exclude it (with graceful degradation); else treat
it as a design problem to resolve in the tech spec.

## Destroying infrastructure

To tear everything down, destroy layers in reverse creation order with the account layer last
(`docs/infra/destroy-infrastructure.md`).

1. Destroy each application environment first. Standing environments run in the `default` workspace,
   so the `is_temporary` gate does **not** disable their deletion protection — the guide calls out
   disabling load balancer deletion protection by hand before you start. Then, within
   `infra/<APP_NAME>/service`:

   ```bash
   terraform init -backend-config=dev.s3.tfbackend
   terraform destroy -var environment_name=dev
   ```

   Repeat for each environment. The guide itself lists only these steps and states the general
   rule — undeploy layers in reverse creation order — so the other per-application layers
   (database, build-repository) follow the service layer.

2. Remove the backends: add `force_destroy = true` and set the lifecycle block's
   `prevent_destroy = false` on the state buckets in `infra/modules/terraform-backend-s3/main.tf`,
   then `terraform apply` in `infra/accounts` to apply those changes. S3 buckets are protected from
   destruction by default to avoid data loss, which is why this step is needed.

3. Move state off S3 before destroying the buckets that hold it: comment out or delete the `backend
   "s3"` block in `infra/accounts/main.tf` and re-init with `terraform init -force-copy` to copy
   state back to local disk.

4. Finally `terraform destroy` the `infra/accounts` module.
