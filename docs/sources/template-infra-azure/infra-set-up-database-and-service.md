---
id: infra-azure-set-up-database-and-service
title: Set up the application database and service
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, database, postgres, service, container-apps, secrets, background-jobs]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-domains-and-https, infra-azure-access-control-and-operations]
integrates_with: [template-application-rails]
summary: How to provision an application's per-environment database layer (PostgreSQL flexible server, role manager, Postgres roles) and service layer (Container App, migrations, environment variables, secrets, background jobs) with the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: f930f2ba39be8ab6a55eaa0b538ad96def2e331b
  paths:
    - docs/infra/set-up-database.md
    - docs/infra/set-up-app-env.md
    - docs/infra/environment-variables-and-secrets.md
    - docs/infra/background-jobs.md
    - docs/infra/database-access-control.md
    - infra/{{app_name}}/app-config/main.tf
    - Makefile
verified: ok
last_documented: 2026-06-29
---

# Set up the application database and service

This guide covers the two per-application layers: the **database** layer and the **service** layer.
It assumes the [account and network](infra-azure-set-up-account-and-network.md) layers already exist.
Throughout, `<APP_NAME>` is the application folder under `infra/` (conventionally `app`) and
`<ENVIRONMENT>` is one of `dev`/`staging`/`prod`.

## 1. Set up the database (per application environment)

Skip this layer entirely if the application has no database (set `has_database = false` in
`infra/<APP_NAME>/app-config/main.tf`). The database setup process (`docs/infra/set-up-database.md`):

1. Deploys an [Azure Database for PostgreSQL flexible
   server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview).
2. Creates an `app` PostgreSQL schema for the application's tables.
3. Creates a Microsoft Entra ID group enabling [Entra ID
   authentication](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication)
   to the database.
4. Creates an Azure Container App Job, the **role manager**, that provisions the Postgres users.
5. Invokes the role manager to create the `app` and `migrator` Postgres users.

**Requirements:** the [account](infra-azure-set-up-account-and-network.md) and a non-default network
for the app must already exist.

Steps:

```bash
# 1. Configure the database backend (writes <ENVIRONMENT>.s3.tfbackend)
make infra-configure-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 2. Build and publish the role-manager image to the build repository
make db-role-manager-release-build
make db-role-manager-release-publish APP_NAME=<APP_NAME>
# copy the published image tag for the next step

# 3. Create the database resources (can take >5 min; review the plan first)
TF_CLI_ARGS_apply="-var=role_manager_image_tag=<IMAGE_TAG>" \
  make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 4. Run the role manager to create the Postgres users
make infra-update-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 5. Verify the roles were configured
make infra-check-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`APP_NAME` is the app folder under `infra` (default `app`); `ENVIRONMENT` is the environment being
created. (Note: the doc names the role manager step's underlying resource a "Lambda function" — that
is AWS terminology carried over from the AWS template; on Azure it is a Container App Job.)

### Database roles and the table-permissions gotcha

The role manager (running as a database admin) creates two roles
(`docs/infra/database-access-control.md`):

- **`migrator`** — assumed by the migration task; can create tables in the `app` schema. Migrations
  run as part of the deploy workflow before the new image is deployed.
- **`app`** — assumed by the web service; has read/write permissions in the `app` schema.

Because, in Postgres, a table created by `migrator` is not automatically accessible to `app`, your
**first migration** must grant default privileges so future tables are usable by the service:

```sql
ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app
```

See the example app's `template-only-app/migrations.sql`. (Source: `docs/infra/set-up-database.md`.)

All database access authenticates via Entra ID (no long-lived credentials). Three Entra groups are
created during provisioning — "DB Admin", "Migrator", and "App". When connecting, the group name is
the username and a generated token is the password; a DB Admin can get a token with
`az account get-access-token --resource-type oss-rdbms`. (Source:
`docs/infra/database-access-control.md`.)

## 2. Set up the application service (per application environment)

The service setup creates the application environment's infrastructure resources (the web Container
App and supporting resources). (Source: `docs/infra/set-up-app-env.md`.)

**Requirements:** a compatible application in the app folder; the app configured in
`infra/<APP_NAME>/app-config/main.tf` (set `has_database`), with production sizing tuned per
environment in `infra/<APP_NAME>/app-config/<ENVIRONMENT>.tf` (e.g. `prod.tf` sets `service_cpu`,
`service_memory`, and `service_desired_instance_count`, ideally after a load test); a non-default
network; and, if `has_database` is true, the database layer set up.

```bash
# 1. Configure the service backend and tfvars (writes <ENVIRONMENT>.s3.tfbackend)
make infra-configure-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 2. Build and publish the application image — either trigger the GitHub Actions
#    "Build and Publish" workflow, or run locally:
make release-build APP_NAME=<APP_NAME>
make release-publish APP_NAME=<APP_NAME>
# copy the published image tag

# 3. Create the service resources with that image tag (review the plan first)
TF_CLI_ARGS_apply="-var=image_tag=<IMAGE_TAG>" \
  make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

Whether the service is configured with database access depends on `has_database` in the app-config
module. (Source: `docs/infra/set-up-app-env.md`.)

## 3. Environment variables and secrets

Applications follow [12-factor](https://12factor.net/config) configuration. The infrastructure
supplies some environment variables automatically (task-role auth, database access, document
storage); applications declare their own extras and secrets in
`infra/<APP_NAME>/app-config/env-config/environment-variables.tf`. (Source:
`docs/infra/environment-variables-and-secrets.md`.)

- **Non-sensitive extras:** add entries to the `default_extra_environment_variables` map (key =
  variable name, value = default across environments). Override per environment by passing
  `service_override_extra_environment_variables` to the `env-config` module from the environment's
  `app-config/<environment>.tf`. Do **not** put credentials here — these values are embedded in the
  task definition and visible to anyone who can view it.
- **Secrets:** add entries to the `secrets` map. Each entry's key is the environment variable name;
  `manage_method` is `"generated"` (Terraform generates and stores a random secret) or `"manual"`
  (Terraform references an existing secret you stored); `secret_name` is the Azure Key Vault location
  to write to or read from. For `manage_method = "manual"`, store the secret in Key Vault **before**
  deploying, or the deploy fails looking for a missing secret name.

## 4. Background jobs

Background jobs are handled by [Azure Container App
Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs?tabs=azure-cli). The template
supports scheduled jobs (e.g. ETL) and event-triggered jobs (on-demand tasks, or — **not yet
implemented** — continuously-running worker tasks consuming a queue). By default a single,
manually-triggered Container App Job is created for running migrations. There is not yet a simpler
interface for additional jobs; add more `azurerm_container_app_job` resources in your
`infra/<APP_NAME>/service` module. (Source: `docs/infra/background-jobs.md`.)

## Deploying ongoing changes

To roll out a new application image to an environment, the release targets are
`release-build` → `release-publish` → `release-run-database-migrations` → `release-deploy` (run with
`APP_NAME` / `ENVIRONMENT` / image tag as appropriate; `Makefile`). Migrations run as the `migrator`
role before the new image is deployed as the `app` role. See
[making infra changes](infra-azure-overview.md) for the general change workflow and
[access control and operations](infra-azure-access-control-and-operations.md) for isolated workspace
testing.
</content>
</invoke>
