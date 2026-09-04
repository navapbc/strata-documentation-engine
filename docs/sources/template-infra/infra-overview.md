---
id: infra-overview
title: template-infra Overview
source: template-infra
doc_type: guide
tags: [infra, terraform, aws, template, layers, environments, configuration]
related: [infra-module-architecture, infra-getting-started, infra-configuration, infra-environments-and-workspaces, infra-database, infra-security-and-access, infra-security-monitoring, infra-capabilities]
component_keys: [template-infra]
integrates_with: [template-application-rails]
summary: The Nava Platform Terraform/AWS infrastructure template — its layer model, environment model, configuration model, and bin/ operator scripts.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - README.md
    - infra/README.md
    - docs/system-architecture.md
    - docs/infra/module-architecture.md
    - docs/infra/infrastructure-configuration.md
    - infra/accounts/main.tf
    - infra/project-config/threat_detection.tf
    - infra/modules/network/resources/main.tf
    - infra/modules/network/resources/waf.tf
    - infra/modules/service/waf.tf
    - infra/{{app_name}}/app-config/main.tf
    - copier.yml
    - bin/
    - Makefile
last_documented: 2026-09-04
verified: ok
---

# template-infra Overview

`template-infra` is the Nava Platform **infrastructure template**: a [copier](https://copier.readthedocs.io/)-based
Terraform/AWS infrastructure-as-code template that provides foundational AWS infrastructure for
deploying modern web applications. It is one building block of the broader Nava Strata suite and is
designed to be composed with a Platform application template.

It is installed into a project with the Nava Platform CLI (`nava-platform infra install .`) and kept
up to date with `nava-platform infra update .` (see `README.md`). This doc describes the template's
own concerns; in a generated project, the `{{app_name}}` placeholder shown throughout is replaced
with the concrete application name.

## What it provisions

Per `docs/system-architecture.md` and `README.md`, a deployed environment includes:

- A nondefault **VPC** with public subnets (for the application load balancer), private subnets (for
  the ECS service), and private subnets for the database; plus optional **NAT gateways** for
  outbound access to non-AWS services (created only when `has_external_non_aws_service = true`,
  which `app-config/main.tf` defaults to `false`) and **VPC endpoints** for in-VPC access to AWS
  services.
- An **Application Load Balancer** in front of an **Amazon ECS** service running the application.
- An **Amazon Aurora Serverless v2 PostgreSQL** database, with a **Database Role Manager** Lambda
  and **Secrets Manager** for credentials.
- A **build repository** ECR registry storing application container images.
- **CloudWatch Logs / Alarms**, an alarms **SNS topic** to an incident management service, and a
  **Terraform backend** S3 bucket for state. Optionally (off by default in `app-config/main.tf`:
  `enable_identity_provider = false`, `enable_notifications = false`) **Cognito** for authentication
  and **SES** for email.
- **AWS GuardDuty** threat detection for the account (on by default), which also backs optional
  malware scanning of files uploaded to the application's S3 storage bucket — see
  [infra-security-monitoring](infra-security-monitoring.md).
- **GitHub Actions** CI/CD that authenticates to AWS via OIDC, builds and publishes images, and
  deploys releases.

## The layer (root-module) model

The infrastructure is organized into independently-deployed **root modules** (layers) that call
reusable **child modules** under `infra/modules/`. Per `infra/README.md`, the layers are:

- **Account layer** (`infra/accounts/`) — Terraform backend (S3 state bucket), the GitHub Actions
  OIDC provider + IAM role/policy, and the account's GuardDuty detector. Deployed first because it
  creates the state bucket the other layers' backends use.
- **Network layer** (`infra/networks/`) — the VPC, subnets, VPC endpoints, the WAF web ACL (always
  created by `infra/modules/network/resources/waf.tf`; attached to the load balancer only when
  `enable_waf` is set), and (optionally) Route 53 hosted zones. Shared across applications,
  environments, and Terraform workspaces.
- Per-application layers under `infra/{{app_name}}/`:
  - **build-repository** — the ECR registry for the application; shared across all environments (no
    `ENVIRONMENT` parameter).
  - **database** — the Aurora cluster and role manager; per environment, optional.
  - **service** — the ECS service, load balancer, and related resources; per environment. This is
    the layer deployed regularly during application deployments.
  - **app-config** — a static configuration module (not a deployed layer of resources; see below).

Deployment order follows the dependency graph (`docs/infra/module-architecture.md`): the account
layer first (it creates the state bucket); then build-repository and network, which depend only on
the account layer and not on each other; then database; then service. See
[infra-module-architecture](infra-module-architecture.md) for the full module structure and the
guidelines for choosing which layer a resource belongs in.

## The environment model

A project has three standing AWS environments — `dev`, `staging`, and `prod` — that share the same
root modules but use different configuration. Each layer/environment pair is bound to an S3 backend
via a `.tfbackend` file (`infra/README.md`):

- Per-environment backends are named after the environment, e.g. `dev.s3.tfbackend`.
- Resources shared across environments (the build-repository) use `shared.s3.tfbackend`.
- Account-wide resources use `<account name>.<account id>.s3.tfbackend`.

On top of the standing environments, the template supports **temporary environments**: per-pull-request
environments and Terraform-**workspace**-based environments for isolated development. These reuse
some standing resources (notably the dev database and Cognito pool) rather than provisioning their
own. See [infra-environments-and-workspaces](infra-environments-and-workspaces.md).

## The configuration model

Per `docs/infra/infrastructure-configuration.md`, all configuration derives from two **static config
modules** rather than from `.tfvars` files:

- **Project config** (`infra/project-config/`) — project-wide settings: account/region, resource
  tags, the set of networks, the AWS services GitHub Actions may manage, CI/CD system notifications,
  and the account's threat-detection defaults.
- **App config** (`infra/{{app_name}}/app-config/`, with a nested `env-config/` for per-environment
  values) — per-application settings such as `has_database`, `has_external_non_aws_service`,
  feature toggles (`enable_https`, `enable_waf`, `enable_notifications`, `enable_identity_provider`),
  and per-environment overrides.

Config modules are **static and side-effect-free**: every output is constant or a deterministic
function of constants, so they can be used both as child modules by the layers and as root modules
that shell scripts read via `terraform apply -auto-approve` + `terraform output`. See
[infra-configuration](infra-configuration.md).

## The `bin/` operator scripts and Make targets

Day-to-day operations run through Make targets in the root `Makefile`. Most call shell scripts in
`bin/`, which in turn call `terraform`; a few (`infra-update-network`, `infra-update-app-database`,
`infra-update-app-service`) invoke `terraform` directly. The same scripts back the GitHub Actions workflows
(`infra/README.md`). Representative Make targets (from `Makefile`):

| Target | Purpose |
| --- | --- |
| `infra-set-up-account ACCOUNT_NAME=<n>` | Create backend + OIDC resources for the current AWS account |
| `infra-configure-network NETWORK_NAME=<n>` / `infra-update-network NETWORK_NAME=<n>` | Configure / apply a network |
| `infra-configure-app-build-repository APP_NAME=<a>` / `infra-update-app-build-repository APP_NAME=<a>` | Configure / apply the build repository |
| `infra-configure-app-database APP_NAME=<a> ENVIRONMENT=<e>` / `infra-update-app-database APP_NAME=<a> ENVIRONMENT=<e>` | Configure / apply a database |
| `infra-update-app-database-roles APP_NAME=<a> ENVIRONMENT=<e>` / `infra-check-app-database-roles APP_NAME=<a> ENVIRONMENT=<e>` | Provision / verify DB roles via the role manager |
| `infra-configure-app-service APP_NAME=<a> ENVIRONMENT=<e>` / `infra-update-app-service APP_NAME=<a> ENVIRONMENT=<e>` | Configure / apply a service |
| `release-build APP_NAME=<a>` / `release-publish APP_NAME=<a>` / `release-run-database-migrations APP_NAME=<a> ENVIRONMENT=<e>` / `release-deploy APP_NAME=<a> ENVIRONMENT=<e>` | Build, publish, migrate, deploy an application release |
| `infra-check-github-actions-auth ACCOUNT_NAME=<n>` | Verify GitHub Actions can authenticate to AWS |
| `infra-lint`, `infra-format`, `infra-check-compliance`, `infra-test-service APP_NAME=<a>` | Lint, format, compliance (checkov/tfsec), and Terratest checks |

The underlying wrapper scripts (`bin/terraform-init`, `bin/terraform-apply`,
`bin/terraform-init-and-apply`) take a module directory and a config name: `bin/terraform-init`
selects the matching `<config_name>.s3.tfbackend` backend config, and `bin/terraform-apply` selects
the matching `<config_name>.tfvars` variables file. You can also call `terraform` directly when needed (e.g.
`terraform import`), remembering to `init` with the right `-backend-config`. See
[infra-module-architecture](infra-module-architecture.md) and
`docs/infra/making-infra-changes.md`.

## Copier mechanics (template authors)

The repo is both a working example and a copier template. `copier.yml` defines two template types
(`base` and `app`) with questions such as `base_project_name`, `base_owner`, `base_default_region`,
and `app_name`/`app_local_port`. Paths under `{{app_name}}/` and files ending in `.jinja` are
rendered into a generated project with the answers substituted. Files listed under `copier.yml`'s
`_exclude` (`README.md`, `LICENSE`, `CONTRIBUTING.md`, `copier.yml`, `code.json`, the issue
templates, etc.) are **not** rendered. Separately,
`template-only-*` paths are excluded by the Nava Platform CLI, which applies a `*template-only*`
source-exclude, so they too never reach a generated project. Either way these are template-author
concerns only. Throughout the docs, treat `{{app_name}}` as a placeholder, never as a literal
directory name.

## Where to go next

- [infra-getting-started](infra-getting-started.md) — install and stand up infrastructure end to end.
- [infra-module-architecture](infra-module-architecture.md) — root/child modules and layer guidelines.
- [infra-configuration](infra-configuration.md) — project-config, app-config, env vars, and secrets.
- [infra-environments-and-workspaces](infra-environments-and-workspaces.md) — standing vs. temporary environments.
- [infra-database](infra-database.md) — Aurora, the role manager, access control, and upgrades.
- [infra-security-and-access](infra-security-and-access.md) — IAM/OIDC, WAF, HTTPS, custom domains, and outbound internet access.
- [infra-security-monitoring](infra-security-monitoring.md) — GuardDuty threat detection, S3 malware scanning, and CI vulnerability/compliance scans.
- [infra-capabilities](infra-capabilities.md) — notifications, identity provider, background jobs, monitoring, feature flags.
