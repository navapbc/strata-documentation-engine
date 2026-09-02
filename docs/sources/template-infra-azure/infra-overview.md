---
id: infra-azure-overview
title: Azure infra template overview
source: template-infra-azure
verified: ok
doc_type: guide
tags: [infra, azure, terraform, template, architecture]
related: [infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service, infra-azure-domains-and-https, infra-azure-access-control-and-operations]
component_keys: [template-infra-azure]
integrates_with: [template-application-rails]
summary: The layer, environment, and configuration model of the Nava Platform Azure infrastructure template, plus the Makefile operator interface and how it is installed into an application.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: e10a383c4871d6eab3999baf63a01e5bd5a81f4c
  paths:
    - README.md
    - infra/README.md
    - docs/system-architecture.md
    - docs/infra/module-architecture.md
    - docs/infra/module-dependencies.md
    - docs/infra/infrastructure-configuration.md
    - docs/infra/making-infra-changes.md
    - Makefile
    - copier.yml
    - infra/project-config/main.tf.jinja
    - infra/project-config/networks.tf
    - infra/accounts/main.tf
    - infra/accounts/container_registry.tf
    - infra/{{app_name}}/app-config/main.tf
last_documented: 2026-07-21
---

# Azure infra template overview

`template-infra-azure` is the Nava Platform **Azure** infrastructure template: a
[copier](https://copier.readthedocs.io/)-based Terraform IaC template that sets up foundational
cloud infrastructure (Terraform state backends, GitHub OIDC for CI/CD, an Azure Container Registry,
networking, a database, and a containerized web service) for an application running on Azure. It is
the Azure counterpart to the AWS `template-infra` template and is part of the
[Strata](https://github.com/navapbc/strata) family.

The template uses an [`azurerm`
backend](https://developer.hashicorp.com/terraform/language/backend/azurerm) for Terraform state and
targets Azure primitives: Container Apps / Container App Jobs, Azure Database for PostgreSQL flexible
server, Application Gateway, Key Vault, Virtual Networks with Private Endpoints, and Microsoft Entra
ID. (Source: `README.md`, `docs/system-architecture.md`.)

## Installation and updates (copier + platform-cli)

The template is rendered into a project by the `nava-platform` CLI, not cloned directly:

```sh
nava-platform infra install --template-uri https://github.com/navapbc/template-infra-azure .
# later, to pull template updates:
nava-platform infra update .
```

Copier substitutes the project answers — `base_project_name`, `base_owner`, `base_default_region`
(an Azure region, default `eastus`), `base_tenant_id`, `base_default_certificate_contact_email`, and
per-app `app_name` — into the rendered files (`copier.yml`). Because of this, paths shown with
`{{app_name}}` in this repo (e.g. `infra/{{app_name}}/service`) appear in a generated project as a
real directory named after the app (the docs refer to it as `infra/<APP_NAME>/...`, conventionally
`infra/app/...`). Template-author files — `copier.yml`, `code.json`, top-level `README.md`,
`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `renovate.json`,
`.github/CODEOWNERS`, and `.github/ISSUE_TEMPLATE` — are stripped from generated projects
(`copier.yml` `_exclude`). (Source: `copier.yml`, `README.md`.)

## The layer model (Terraform root modules)

Infrastructure code lives under `infra/` and is split into independently-deployed **root modules**
and reusable **child modules** under `infra/modules/`. Root modules are deployed separately, each in
the correct order; child modules are called from root modules. Root modules generally create their
own Azure Resource Group. (Source: `docs/infra/module-architecture.md`, `infra/README.md`.)

The layers, deployed in dependency order:

- **Account layer** (`infra/accounts/`) — per Azure subscription. Creates the Terraform backend
  storage (an Azure Storage Account + container with native state locking), the GitHub OIDC
  application/identity in Microsoft Entra, a subscription-level (account-level) Log Analytics Workspace, the project-wide Azure
  Container Registry (in the shared account), and the certificate store. Must be deployed first
  because it creates the state backend the other layers use. (Source: `infra/accounts/main.tf`,
  `infra/accounts/container_registry.tf`.)
- **Network layer** (`infra/networks/`) — per network (shared across apps, environments, and
  Terraform workspaces). Creates a Virtual Network, subnets (gateway / private-endpoints / database /
  apps-private), Private DNS zones, and a Container App Environment used by the apps in that network.
  (Source: `infra/networks/main.tf.jinja`, `docs/infra/module-architecture.md`.)
- **Database layer** (`infra/<APP_NAME>/database/`) — per application environment, optional.
  Provisions the PostgreSQL flexible server, the `app` schema, Entra ID groups, and the "role
  manager" Container App Job. Skipped entirely when an app has no database.
- **Service layer** (`infra/<APP_NAME>/service/`) — per application environment. The
  regularly-deployed layer: the web Container App, the migrations Container App Job, secrets, storage
  wiring, and the Application Gateway / DNS records.

Dependency order is account → network → database → service; the service layer depends on the
account, network, and (when present) database layers (`docs/infra/module-architecture.md`).

### Guidelines for choosing a layer

When deciding where a resource belongs, the module-architecture doc gives these rules of thumb:
default to the service layer; move a resource to a different layer when it does not map one-to-one
with application environments; respect uniqueness constraints (a resource that must be unique at some
scope belongs to the layer that creates exactly one per instance); separate resources by who is
authorized to manage them; and put resources with out-of-band setup steps (like a database whose
roles must be provisioned before a service can use it) upstream of their dependents — which is why
the database layer is separate from the service layer. (Source:
`docs/infra/module-architecture.md`.)

### Managing dependencies between modules

Two patterns keep dependencies explicit (`docs/infra/module-dependencies.md`):

- **Within one root module**, connect child modules with explicit `output`/`variable` wiring
  (`module.b` consumes `module.a.output`) — never a `data` source, which would not register in
  Terraform's dependency graph and could race.
- **Across root modules** (separate state files), use a shared **config module** that defines
  identifying values, plus a `data` source in the consuming module that queries by those values. The
  template uses shared config rather than the `tfe_outputs` data source.

## The environment model

A project has three application environments — `dev`, `staging`, `prod` — that share the same root
modules but differ by configuration (`infra/README.md`;
`infra/{{app_name}}/app-config/main.tf`'s `environments` local lists exactly these three). Backend
configuration is stored in
[`.tfbackend`](https://developer.hashicorp.com/terraform/language/backend#file) files: per-app
service/database backends are named after the environment (e.g. `dev.azurerm.tfbackend`), resources
shared across environments use `shared.azurerm.tfbackend`, and account-level resources use
`<account name>.<account id>.azurerm.tfbackend`. Temporary / PR environments are also supported for
each service (referenced in the HTTPS and workspace-isolation guides). For isolated development,
Terraform **workspaces** create a parallel, name-prefixed copy of a root module's resources — see
[access control and operations](infra-azure-access-control-and-operations.md). (Source:
`infra/README.md`.)

## The configuration model (project-config vs app-config)

All configuration is derived from two kinds of **static configuration modules**, which only hold
statically-known values and create no resources (`docs/infra/infrastructure-configuration.md`):

- **Project config** (`infra/project-config/`) — project-level values: `project_name`, `owner`,
  `code_repository_url`, `default_region`, `tenant_id`, the `github_actions_azure_config` (GitHub
  OIDC client/object ids per account), `infra_admins`, and the default certificate contact email
  (`infra/project-config/main.tf.jinja`), plus the `network_configs` / `domain_config` definitions
  and `shared_account_name` / `shared_hosted_zone` (`infra/project-config/networks.tf`).
- **App config** (`infra/<APP_NAME>/app-config/`) — per-application values: the `environments` list,
  `has_database` / `has_blob_storage` / `has_incident_management_service` flags, the
  `shared_network_name`, and a reusable `env-config` module wired up per environment via the
  `dev.tf`, `staging.tf`, and `prod.tf` files (surfaced through the `environment_configs` map in
  `infra/{{app_name}}/app-config/main.tf`).

Config modules are used two ways: as **root modules** by shell scripts and CI/CD (which fetch values
with `terraform apply -auto-approve` followed by `terraform output` — safe because the modules have
no side effects), and as **child modules** called by the layer root modules
(`module "project_config" { source = "../../project-config" }`). The doc explains why static config
modules are preferred over `.tfvars`: convention-enforced derived values, usability outside Terraform
by shell scripts, and elimination of the risk of pairing the wrong `.tfvars` with a backend config.
(Source: `docs/infra/infrastructure-configuration.md`.)

## Operator interface: the root Makefile

Operators drive the template through Make targets in the root `Makefile`, which call shell scripts
under `./bin` (these wrappers in turn invoke `terraform`); the same scripts are reused by the GitHub
Actions CI/CD workflows. You can use the Make targets, the underlying `bin/` scripts directly, or
raw `terraform` for operations the wrappers don't cover (e.g. `terraform import`). Extra arguments
can be passed through `TF_CLI_ARGS` / `TF_CLI_ARGS_apply`. (Source: `Makefile`,
`docs/infra/making-infra-changes.md`, `infra/README.md`.)

Key Make targets (from the root `Makefile`):

| Target | Purpose |
| --- | --- |
| `infra-set-up-account ACCOUNT_NAME=<name> [args=<sub-id>]` | Bootstrap an account: state backend + GitHub OIDC + (shared) container registry; writes its `.tfbackend`. |
| `infra-update-current-account` / `infra-update-account ACCOUNT_NAME=<name>` | Apply account-layer changes. |
| `infra-configure-network NETWORK_NAME=<name>` / `infra-update-network NETWORK_NAME=<name>` | Configure / apply the network layer. |
| `infra-configure-app-database` / `infra-update-app-database` (`APP_NAME`, `ENVIRONMENT`) | Configure / apply an app's database layer. |
| `infra-update-app-database-roles` / `infra-check-app-database-roles` | Provision and verify Postgres roles via the role manager job. |
| `infra-configure-app-service` / `infra-update-app-service` (`APP_NAME`, `ENVIRONMENT`) | Configure / apply an app's service layer. |
| `release-build` / `release-publish` / `release-run-database-migrations` / `release-deploy` | Build, publish, migrate, and deploy the application image. |
| `db-role-manager-release-build` / `db-role-manager-release-publish` / `db-role-manager-release-deploy` | Build/publish/deploy the DB role manager image. |
| `infra-lint` / `infra-format` / `infra-validate-modules` / `infra-test-service` | Lint, format, validate child modules, and run the service-layer Terratest suite. |
| `infra-check-compliance` (`-checkov`, `-tfsec`) | Run Checkov + tfsec compliance scans. |

The Make targets and Terraform both call the shell scripts under `bin/` (e.g. `set-up-account`,
`terraform-apply`, `terraform-init`, `account-ids-by-name`), which form the wrapper layer that
invokes `terraform` and is reused by the GitHub Actions workflows. (Source: `Makefile`, `bin/`.)

## First-time setup path

For a brand-new project, the setup order (from `infra/README.md`) is: install the template →
set up infrastructure developer tools → set up GitHub → set up the Azure account → set up the
network → then per application: set up the database → set up the application environment →
configure environment variables and secrets → set up background jobs. These steps are covered in
[set up account and network](infra-azure-set-up-account-and-network.md) and
[set up database and service](infra-azure-set-up-database-and-service.md).

## Relationship to the application template

This template provides only infrastructure; it expects a compatible application in the
`infra/<APP_NAME>` app folder that meets the platform's application requirements. The Nava Platform
v1 Rails application template (`template-application-rails`) is the kind of app this infra is paired
with, which is why setup steps reference building and deploying the application container image and
running database migrations. (Source: `README.md` "Application Requirements".)
