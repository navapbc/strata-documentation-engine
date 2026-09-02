---
id: infra-environments-and-workspaces
title: Environments, Workspaces, and Temporary Environments
source: template-infra
verified: ok
doc_type: guide
tags: [infra, environments, workspaces, pull-request-environments, terraform, deployment]
related: [infra-overview, infra-module-architecture, infra-getting-started, infra-database]
integrates_with: [template-application-rails]
summary: The standing dev/staging/prod environments plus the temporary environments — Terraform workspaces, per-pull-request environments, and how out-of-band resources are shared or excluded.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 80a7cc8ec802c442098933f65280175b8453c659
  paths:
    - infra/README.md
    - docs/infra/staging-and-production-environments.md
    - docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md
    - docs/infra/pull-request-environments.md
    - docs/infra/temporary-environments-and-out-of-band-resources.md
    - docs/infra/destroy-infrastructure.md
last_documented: 2026-07-21
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
- **CI end-to-end** — created and torn down by `template-only-ci-infra.yml` to test creating a
  project from scratch (tests live in `infra/test/`).

### Workspaces for isolated development

By default each root module has a single `default` workspace. A non-default workspace deploys a
parallel set of resources without configuring a new backend
(`docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md`). Notable behaviors in
non-default workspaces:

- Resource names are **prefixed with the workspace name** to avoid "resource already exists" errors.
- Deletion protection (databases, storage buckets) is **disabled**, since these environments are
  temporary.
- Resources that are hard to create in isolation, such as **DNS records**, are **not created**.

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
(`docs/infra/destroy-infrastructure.md`): destroy each environment's per-application layers first —
the guide spells out destroying within `infra/<APP_NAME>/service`, and you should destroy any other
per-application layers (e.g. the database layer) in reverse creation order as well. Then to remove
the backends add `force_destroy = true` and set `prevent_destroy = false` on the state buckets, run
`terraform apply` in `infra/accounts` to apply those changes, migrate state locally
(`terraform init -force-copy` after commenting out the S3 backend block), and finally
`terraform destroy` the `infra/accounts` module.
