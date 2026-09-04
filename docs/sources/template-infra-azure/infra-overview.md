---
id: infra-azure-overview
title: Azure infra template overview
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, template, architecture, copier]
related: [infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service, infra-azure-domains-and-https, infra-azure-access-control-and-operations, infra-azure-making-changes]
component_keys: [template-infra-azure]
integrates_with: [template-application-rails]
summary: The layer, environment, and configuration model of the Nava Platform Azure infrastructure template, plus the resources each layer creates, the Makefile/bin operator interface, and how the template is installed and updated.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - README.md
    - infra/README.md
    - docs/system-architecture.md
    - docs/infra/module-architecture.md
    - docs/infra/module-dependencies.md
    - docs/infra/infrastructure-configuration.md
    - Makefile
    - copier.yml
    - infra/project-config/main.tf.jinja
    - infra/project-config/networks.tf
    - infra/project-config/outputs.tf
    - infra/project-config/azure_resource_providers.tf
    - infra/accounts/main.tf
    - infra/accounts/container_registry.tf
    - infra/accounts/shared_hosted_zone.tf
    - infra/networks/main.tf.jinja
    - infra/{{app_name}}/app-config/main.tf
    - infra/{{app_name}}/app-config/outputs.tf
    - infra/{{app_name}}/app-config/build_repository.tf
    - infra/{{app_name}}/database/main.tf
    - infra/{{app_name}}/service/main.tf
    - infra/{{app_name}}/service/secrets.tf
    - infra/{{app_name}}/app-config/env-config/service.tf
    - docs/infra/making-infra-changes.md
    - docs/infra/style-guide.md
last_documented: 2026-09-04
verified: ok
---

# Azure infra template overview

`template-infra-azure` is the Nava Platform **Azure** infrastructure template: a
[copier](https://copier.readthedocs.io/)-based Terraform IaC template that stands up foundational
cloud infrastructure — Terraform state backends, GitHub OIDC for CI/CD, an Azure Container Registry,
networking, a PostgreSQL database, blob storage, and a containerized web service — for an
application running on Azure. It is the Azure counterpart to the AWS `template-infra` template and
part of the [Strata](https://github.com/navapbc/strata) family. (Source: `README.md`.)

Terraform state lives in an
[`azurerm` backend](https://developer.hashicorp.com/terraform/language/backend/azurerm), and the
template targets Azure primitives: Container Apps and Container App Jobs, Azure Database for
PostgreSQL flexible server, Application Gateway, Key Vault, Storage Accounts, Virtual Networks with
Private Endpoints and Private DNS zones, Log Analytics, and Microsoft Entra ID. Root modules pin
`required_version = "~>1.11.0"` and the `hashicorp/azurerm` provider at `~> 5.0.0`. (Source:
`docs/system-architecture.md`, `infra/accounts/main.tf`, `infra/{{app_name}}/service/main.tf`.)

## Installation and updates (copier + platform-cli)

The template is rendered into a project by the `nava-platform` CLI rather than cloned directly
(`README.md`):

```sh
nava-platform infra install --template-uri https://github.com/navapbc/template-infra-azure .
# later, to pull template updates:
nava-platform infra update .
```

`copier.yml` defines two sub-templates selected by the `template` question — `base` (project-wide
scaffolding) and `app` (one application's infra directory) — and the answers it collects:

- **Base:** `base_project_name` (lower-case letters, digits, dashes, underscores),
  `base_owner` (slug used for tagging and image repository names), `base_code_repository_url`
  (defaults to `https://github.com/{{ base_owner }}/{{ base_project_name }}`), `base_default_region`
  (an Azure region chosen from a fixed list, default `eastus`), and `base_tenant_id`.
- **App:** `app_name` (same slug rules) and `app_has_dev_env_setup` (boolean, default `false`, used
  to gate CI/CD).

Because of copier substitution, paths written as `infra/{{app_name}}/...` in this repository appear
in a generated project as a real directory named after the app — the shipped docs call it
`infra/<APP_NAME>/...`, conventionally `infra/app/...`. `{{app_name}}` is a placeholder, never a
literal directory name. Two files are Jinja templates rather than plain Terraform:
`infra/project-config/main.tf.jinja` (project answers) and `infra/networks/main.tf.jinja`, whose
header notes it is owned by the `base` template but **re-rendered when a new app is added** so it can
import each app's config module — behavior that "depends on special support in the nava-platform
CLI". Copier answers are recorded under `.template-infra/`. (Source: `copier.yml`,
`infra/project-config/main.tf.jinja`, `infra/networks/main.tf.jinja`.)

Template-author files are stripped from generated projects by `copier.yml`'s `_exclude` list:
`/.git`, `/.github/CODEOWNERS`, `/.github/ISSUE_TEMPLATE`, `/copier.yml`, `/code.json`,
`/CODE_OF_CONDUCT.md`, `/CONTRIBUTING.md`, `/LICENSE`, `/README.md`, `/SECURITY.md`, and
`/renovate.json`. The list covers those files only — the repo root also holds `template-only-app/`
and `template-only-docs/`, which are not in `_exclude`. Everything under `docs/` and `infra/` **is**
shipped into generated projects, so those docs are written for the project team, not the template
authors. `_skip_if_exists` protects
`/{{ app_name }}/` and `/{{ app_name }}/Makefile` so an existing application directory is not
overwritten. (Source: `copier.yml`.)

## The layer model (Terraform root modules)

Infrastructure code lives under `infra/`, split into independently-deployed **root modules** and
reusable **child modules** under `infra/modules/`. Root modules are applied separately, in dependency
order; child modules are called from root modules. Each root module generally creates its own Azure
Resource Group. (Source: `docs/infra/module-architecture.md`, `infra/README.md`.)

| Layer | Root module | Scope | Creates |
| --- | --- | --- | --- |
| Account | `infra/accounts/` | one per Azure subscription | Terraform state backend, GitHub OIDC identity, subscription Log Analytics workspace, certificate Key Vault, container registry (shared subscription only) |
| Network | `infra/networks/` | one per configured network | Virtual Network, subnets, NAT gateway, Container App Environment, Private DNS zones and endpoints, DNS hosted zone and TLS certificates |
| Database | `infra/<APP_NAME>/database/` | per app per environment, optional | PostgreSQL flexible server, `app` schema, Entra groups, role-manager Container App Job |
| Service | `infra/<APP_NAME>/service/` | per app per environment | web Container App, migrations Container App Job, Key Vault + secrets, blob storage, Application Gateway and DNS records |

Dependency order is **account → network → database → service**. The account layer must go first
because it creates the state backend the other layers use; the per-environment service and database
layers are deployed last and are the ones redeployed routinely as part of application deploys.
(Source: `docs/infra/module-architecture.md`.)

### What each layer actually creates

- **Account** (`infra/accounts/main.tf`) — a resource group named after the project; a
  `subscription-logs` Log Analytics workspace (`PerGB2018`, 30-day retention); a `<project>-tf`
  resource group holding the Terraform backend (a `tfst<hash>` storage account, name derived by
  hashing subscription id + resource group and truncating to Azure's 24-character limit, via
  `infra/modules/terraform-backend-azure`); the `auth-github-actions` module registering the
  `<project>-<account_name>-github-oidc` Entra application; and the certificate store
  (`infra/modules/certificate-store/resources`). Subscription ids are resolved by name through the
  `bin/account-ids-by-name` external data source.
- **Container registry** (`infra/accounts/container_registry.tf`) — unlike the AWS template, which
  has a per-app `build-repository` root module, the Azure template creates **one Azure Container
  Registry for the whole project in the account layer**. The registry resource is created only in the
  subscription whose name matches `shared_account_name`; other subscriptions look it up with a data
  module and grant the GitHub Actions principal `Contributor` on it. Image repository names are
  derived per app in `infra/{{app_name}}/app-config/build_repository.tf` as
  `<owner>/<app_name>` (plus `<owner>/db-role-manager` when the app has a database).
- **Shared DNS zone** (`infra/accounts/shared_hosted_zone.tf`) — when `shared_hosted_zone` is set,
  the shared subscription owns the `azurerm_dns_zone` and other subscriptions get a data lookup plus
  a `DNS Zone Contributor` assignment for GitHub Actions.
- **Network** (`infra/networks/main.tf.jinja`) — a `<project>-network-<network_name>` resource group,
  a `logs` Log Analytics workspace, the `network/resources` module (VNet, subnets, NAT gateway,
  Container App Environment, Private DNS zones and the container-registry private endpoint), the
  `domain/resources` module (DNS zone and TLS certificates), and a private endpoint for the
  certificate Key Vault.
- **Database** (`infra/{{app_name}}/database/main.tf`) — a `<app>-<env>-db` resource group and
  `infra/modules/database/resources`, which creates the PostgreSQL flexible server (version 16,
  delegated into the `database` subnet, `public_network_access_enabled = false`, Entra-only
  authentication, geo-redundant backups, `B_Standard_B1ms` by default, zone-redundant HA for
  non-burstable SKUs), the application database, server parameters (`log_statement = ddl`,
  `log_min_duration_statement = 100`), the DB Admin / Migrator / App Entra groups, and the
  role-manager Container App Job.
- **Service** (`infra/{{app_name}}/service/main.tf`) — a `<app>-<env>-service` resource group, the
  `service` module (web Container App plus a `<service>-job` Container App Job, both on the
  `Consumption` workload profile with dedicated user-assigned managed identities), a per-service
  secrets Key Vault and its secrets, optional blob storage, and private endpoints for the Key Vault
  and storage account.

### Guidelines for choosing a layer

When deciding where a resource belongs, `docs/infra/module-architecture.md` gives these rules of
thumb: default to the service layer; move a resource elsewhere when it does not map one-to-one with
application environments; respect uniqueness constraints (a resource that must be unique at some
scope belongs to the layer that creates exactly one per instance); separate resources by who is
authorized to manage them; and put resources with out-of-band setup steps upstream of their
dependents — which is precisely why the database layer is separate from the service layer (roles and
schemas must be provisioned before a service can use them).

### Managing dependencies between modules

Two patterns keep dependencies explicit (`docs/infra/module-dependencies.md`):

- **Within one root module**, wire child modules together with explicit `output`/`variable` pairs
  (`module.b` consumes `module.a.output`). Do **not** use a `data` source for this — a data source
  does not appear in Terraform's dependency graph, so the two resources can race.
- **Across root modules** (separate state files), use a shared **config module** that defines the
  identifying values, plus a `data` source in the consuming module that queries by those values. The
  template deliberately uses shared config modules rather than the `tfe_outputs` data source
  (`docs/infra/style-guide.md`).

## The environment model

A project has three application environments — `dev`, `staging`, `prod` — which share the same root
modules and differ only by configuration (`infra/README.md`; the `environments` local in
`infra/{{app_name}}/app-config/main.tf` lists exactly these three, and `dev.tf` / `staging.tf` /
`prod.tf` instantiate the shared `env-config` module for each). Backend configuration lives in
[`.tfbackend`](https://developer.hashicorp.com/terraform/language/backend#file) files:

- per-app service and database backends are named after the environment (`dev.azurerm.tfbackend`),
- resources shared across environments use `shared.azurerm.tfbackend`,
- account-level resources use `<account name>.<account id>.azurerm.tfbackend`.

`infra/example.azurerm.tfbackend` is the template these files are generated from (by
`bin/create-tfbackend`); it carries `resource_group_name`, `storage_account_name`, `container_name`,
`key`, and `subscription_id`.

**Temporary environments.** The service and database root modules both treat any non-`default`
Terraform workspace as temporary through `local.prefix`, which prefixes resource names with the
workspace name. The `local.is_temporary` effects, however, live in the service layer: it disables
deletion protection, skips creating the per-service resource group (its name is referenced
directly), looks up the secrets Key Vault instead of creating it, suffixes generated secret names
with the workspace name, and skips DNS records. The database root module declares `is_temporary`
(`infra/{{app_name}}/database/main.tf`) but no resource in that layer acts on it. This is the mechanism behind both PR preview environments and isolated manual
development — see
[access control and operations](infra-azure-access-control-and-operations.md). (Source:
`infra/{{app_name}}/service/main.tf`, `infra/{{app_name}}/service/secrets.tf`,
`infra/{{app_name}}/database/main.tf`.)

## The configuration model (project-config vs app-config)

All configuration derives from **static configuration modules** that hold only statically-known
values and create no resources (`docs/infra/infrastructure-configuration.md`):

- **Project config** (`infra/project-config/`) — `project_name`, `owner`, `code_repository_url` (and
  a derived `code_repository` `org/repo` string), `default_region`, `tenant_id`,
  `github_actions_azure_config` (GitHub OIDC client/object ids per account) and `infra_admins`
  (`main.tf.jinja`); `network_configs` with each network's `account_name`, `domain_config`, and
  `network`/subnet definitions, plus `shared_account_name`, `shared_hosted_zone`, and
  `manage_privatelink_dns` (`networks.tf`); and the `azure_resource_providers` list with
  `azure_resource_providers_autoenable` (`azure_resource_providers.tf`). It also emits `default_tags`
  (project, owner, repository, `terraform = true`, and the current workspace) and a
  `project_unique_id` derived from `md5(code_repository_url)` used to make globally-unique Azure
  resource names.
- **App config** (`infra/<APP_NAME>/app-config/`) — the `environments` list, the `has_database`,
  `has_blob_storage`, and `has_incident_management_service` flags, `shared_network_name`, the
  `build_repository_config` object describing the registry and image repositories, and an
  `environment_configs` map produced by instantiating the `env-config` child module per environment.
  `env-config` derives the per-environment `service_config`, `database_config`, `storage_config`,
  and `domain_config`, and takes the sizing knobs `service_cpu`, `service_memory`,
  `service_desired_instance_count`, and `service_application_gateway_sku_name` (validated against
  `Basic`, `Standard_v2`, `WAF_v2`). The app name itself is inferred from the module's own path via
  `regex("/infra/([^/]+)/app-config$", abspath(path.module))`.

Config modules are consumed two ways: as **root modules** by shell scripts and CI/CD, which run
`terraform apply -auto-approve` and then `terraform output` (safe precisely because the modules have
no side effects), and as **child modules** called from the layer root modules
(`module "project_config" { source = "../../project-config" }`). The doc explains why static config
modules beat `.tfvars`: derived values can enforce a naming convention (a service is always
`"${app_name}-${environment}"`), values are readable outside Terraform by shell scripts, and there is
no way to pair the wrong `.tfvars` with an initialized backend. Keep config module outputs static —
no environment sensitivity, no workspace or timestamp dependence, no side effects. (Source:
`docs/infra/infrastructure-configuration.md`,
`infra/{{app_name}}/app-config/env-config/service.tf`.)

### Azure resource provider registration

`infra/project-config/azure_resource_providers.tf` lists the Azure resource providers the project
needs (`Microsoft.App`, `Microsoft.ContainerRegistry`, `Microsoft.DBforPostgreSQL`,
`Microsoft.EventGrid`, `microsoft.insights`, `Microsoft.KeyVault`, `Microsoft.ManagedIdentity`,
`Microsoft.Network`, `Microsoft.OperationalInsights`, `Microsoft.Storage`, plus
`Microsoft.Authorization` and `Microsoft.Resources` for context). Root modules set
`resource_provider_registrations = "none"` and pass this list as `resource_providers_to_register`
only when `azure_resource_providers_autoenable` is `true`, so a team without registration permission
can set the flag to `false` and have the providers registered out of band — see
[set up account and network](infra-azure-set-up-account-and-network.md).

## Operator interface: the root Makefile and `bin/`

Operators drive the template through Make targets in the root `Makefile`, which call shell scripts
under `./bin`, which in turn invoke `terraform`; the same scripts are reused by the GitHub Actions
CI/CD workflows. You can use the Make targets, the `bin/` scripts directly, or raw `terraform` for
operations the wrappers don't cover. (Source: `Makefile`, `infra/README.md`,
`docs/infra/making-infra-changes.md`.)

| Target | Purpose |
| --- | --- |
| `infra-set-up-account ACCOUNT_NAME=<name> [args=<sub-id>]` | Bootstrap an account: state backend + GitHub OIDC + (shared) container registry; writes its `.tfbackend`. |
| `infra-update-account ACCOUNT_NAME=<name>` / `infra-update-current-account` | Apply account-layer changes. |
| `infra-configure-network` / `infra-update-network` (`NETWORK_NAME`) | Configure / apply the network layer. |
| `infra-configure-app-database` / `infra-update-app-database` (`APP_NAME`, `ENVIRONMENT`) | Configure / apply an app's database layer. |
| `infra-update-app-database-roles` / `infra-check-app-database-roles` | Provision and verify Postgres roles via the role-manager job. |
| `infra-configure-app-service` / `infra-update-app-service` (`APP_NAME`, `ENVIRONMENT`) | Configure / apply an app's service layer. |
| `release-build` / `release-publish` / `release-run-database-migrations` / `release-deploy` | Build, publish, migrate, and deploy the application image. |
| `db-role-manager-release-build` / `-publish` / `-deploy` | Build, publish, and deploy the DB role-manager image. |
| `infra-lint` / `infra-format` / `infra-validate-modules` / `infra-test-service` | Lint, format, validate child modules, and run the service-layer Terratest suite. |
| `infra-check-compliance` (`-checkov`, `-tfsec`) | Run Checkov and tfsec compliance scans. |

Setting `PLAN_ONLY` swaps the Terraform `infra-update-*` targets from `apply` to `plan` (it sets the
shared `terraform_update_cmd` variable, so `infra-update-app-database-roles`, which runs
`./bin/create-or-update-database-roles` rather than `terraform`, is unaffected), and extra flags can
be threaded through `TF_CLI_ARGS` / `TF_CLI_ARGS_apply` or the `args` variable. The wrapper scripts
are covered in [making infra changes](infra-azure-making-changes.md).

## First-time setup path

For a brand-new project the order in `infra/README.md` is: install the template → set up
infrastructure developer tools → set up GitHub → set up the Azure account → set up the virtual
network → then, per application: set up the database → set up the application environment →
configure environment variables and secrets → set up background jobs. New developers joining an
already-deployed project instead do: install tools → read
[making infra changes](infra-azure-making-changes.md) → read the workspace-isolation workflow → read
the style guide.

Those steps are covered in
[set up account and network](infra-azure-set-up-account-and-network.md) and
[set up database and service](infra-azure-set-up-database-and-service.md).

## Relationship to the application template

This template ships infrastructure only; it expects a compatible application in the app folder that
meets the platform's application requirements, and `README.md` notes that the Platform application
templates already satisfy them — it names no specific template. (Pairing with the Rails application
template, `template-application-rails`, is a cross-repo inference from the Platform template list,
not a claim in this repo's `README.md`.) Either way the setup path includes building and publishing
the application container image and running database migrations against the same image. (Source:
`README.md`.)

## Known gaps in the shipped docs

Recorded so readers are not surprised:

- `docs/README.md` is an empty file, so there is no index of the shipped docs; `infra/README.md` is
  the real entry point.
- `docs/` has no `decisions/` (ADR) directory, unlike the AWS template — several docs link to ADRs
  and template-only guides in `navapbc/template-infra` instead.
- The `infra-configure-monitoring-secrets` Make target calls `./bin/configure-monitoring-secret`,
  which does not exist in `bin/`; the related `has_incident_management_service` flag in
  `app-config/main.tf` is set but never read by any Terraform in the repo.
- `has_blob_storage` (on by default) provisions a Storage Account, a `documents` container, an Event
  Grid system topic, and the `AZURE_STORAGE_*` service environment variables, but no shipped doc
  under `docs/infra/` covers it; the details in this doc set come from the Terraform.
