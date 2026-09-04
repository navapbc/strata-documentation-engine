---
id: infra-azure-set-up-database-and-service
title: Set up the application database and service
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, database, postgres, service, container-apps, secrets, storage, background-jobs]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-domains-and-https, infra-azure-access-control-and-operations, infra-azure-making-changes]
integrates_with: [template-application-rails]
summary: How to provision an application's per-environment database layer (PostgreSQL flexible server, role manager, Entra-authenticated Postgres roles) and service layer (Container App, migrations job, environment variables, secrets, blob storage, background jobs) with the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - docs/infra/set-up-database.md
    - docs/infra/set-up-app-env.md
    - docs/infra/environment-variables-and-secrets.md
    - docs/infra/background-jobs.md
    - docs/infra/database-access-control.md
    - infra/{{app_name}}/app-config/main.tf
    - infra/{{app_name}}/app-config/prod.tf
    - infra/{{app_name}}/app-config/env-config/variables.tf
    - infra/{{app_name}}/app-config/env-config/service.tf
    - infra/{{app_name}}/app-config/env-config/database.tf
    - infra/{{app_name}}/app-config/env-config/storage.tf
    - infra/{{app_name}}/app-config/env-config/environment-variables.tf
    - infra/{{app_name}}/database/main.tf
    - infra/{{app_name}}/database/role_manager_image_tag.tf
    - infra/{{app_name}}/service/main.tf
    - infra/{{app_name}}/service/secrets.tf
    - infra/{{app_name}}/service/storage.tf
    - infra/{{app_name}}/service/image_tag.tf
    - infra/modules/database/resources/main.tf
    - infra/modules/database/resources/role_manager.tf
    - infra/modules/database/resources/role_manager/src/role_manager/manage.py
    - infra/modules/service/main.tf
    - infra/modules/service/access_control.tf
    - infra/modules/service/database_access.tf
    - infra/modules/secret/main.tf
    - infra/modules/storage/main.tf
    - infra/modules/storage/events.tf
    - bin/create-or-update-database-roles
    - bin/run-database-migrations
    - bin/run-app-job
    - bin/check-database-roles
    - Makefile
last_documented: 2026-09-04
verified: needs-review
---

# Set up the application database and service

This guide covers the two per-application layers: the **database** layer and the **service** layer.
It assumes the [account and network](infra-azure-set-up-account-and-network.md) layers already exist.
Throughout, `<APP_NAME>` is the application folder under `infra/` (conventionally `app`, written
`infra/{{app_name}}/` in the template repository) and `<ENVIRONMENT>` is one of `dev`, `staging`, or
`prod`.

## 1. Set up the database (per application environment)

Skip this layer entirely if the application has no database — set `has_database = false` in
`infra/<APP_NAME>/app-config/main.tf` and skip applying the `infra/<APP_NAME>/database` root module.
The flag itself does not block that module; what it does is make the service layer skip its database
wiring (`infra/modules/service/main.tf`) and make `release-run-database-migrations` exit early
(`bin/run-database-migrations`). The database setup process (`docs/infra/set-up-database.md`):

1. Deploys an application database cluster using [Azure Database for PostgreSQL flexible
   server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview).
2. Creates a PostgreSQL schema `app` to hold the application's tables.
3. Creates a Microsoft Entra group allowing [connection with Entra ID
   authentication](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication).
4. Creates an Azure Container App Job — the **role manager** — that provisions the Postgres users
   used by the application service and by the migrations task.
5. Invokes the role manager to create the `app` and `migrator` Postgres users.

**Requirements:** the [Azure account](infra-azure-set-up-account-and-network.md) is set up and a
non-default network exists for the application.

### Steps

```bash
# 1. Configure the database backend (writes the environment's tfbackend)
make infra-configure-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 2. Build and publish the role-manager image to the build repository
make db-role-manager-release-build
make db-role-manager-release-publish APP_NAME=<APP_NAME>
# copy the published image tag for the next step

# 3. Create the database resources (can take over 5 minutes; review the plan first)
TF_CLI_ARGS_apply="-var=role_manager_image_tag=<IMAGE_TAG>" \
  make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 4. Run the role manager to create the Postgres users
make infra-update-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 5. Verify the roles were configured properly
make infra-check-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`APP_NAME` is the application folder under `infra` (`app` by default) and `ENVIRONMENT` is the
environment being created. Steps 4 and 5 run `bin/create-or-update-database-roles` and
`bin/check-database-roles`, which read the `db_resource_group_name` and `role_manager_job_name`
outputs from the database root module and invoke the role-manager Container App Job through
`bin/run-app-job` with the command `["manage"]` and `["check"]` respectively.

After the first apply you can omit `role_manager_image_tag`:
`infra/{{app_name}}/database/role_manager_image_tag.tf` reads the previous value back out of remote
state and re-emits it as an output, so `plan`/`apply` work with no required variables.

> **Two AWS leftovers in `docs/infra/set-up-database.md`.** It tells you step 1 writes the tfbackend
> into "the `infra/app/service` module directory" (it is the `database` module directory), and it
> calls the role manager a "Lambda function" in step 4 — on Azure it is a Container App Job. Both are
> carried over from the AWS `template-infra` docs.

### What the database layer creates

From `infra/modules/database/resources/` (called by `infra/{{app_name}}/database/main.tf`):

- An `azurerm_postgresql_flexible_server` — PostgreSQL **16**, delegated into the network's
  `database` subnet with the `privatelink.postgres.database.azure.com` private DNS zone,
  `public_network_access_enabled = false`, geo-redundant backups on, Entra-only authentication
  (`password_auth_enabled = false`), and SKU `B_Standard_B1ms` as passed by the root module.
  Zone-redundant high availability is enabled automatically for any non-burstable SKU (any SKU whose
  name does not start with `B`).
- The application database, plus server parameters `log_statement = ddl` (log DDL such as CREATE,
  ALTER, DROP) and `log_min_duration_statement = 100` (log statements taking 100 ms or longer).
- Three Entra security groups — DB Admin, Migrator, and App — each with the account's `infra_admins`
  object ids as owners and `prevent_duplicate_names = true`, since the template looks groups up by
  name. The DB Admin group is registered as the server's Entra administrator.
- A user-assigned managed identity for the role manager, added to all three groups, with `AcrPull`
  on the container registry; and the role-manager Container App Job itself (`0.5` CPU / `1Gi`,
  manual trigger, one replica, 3600-second timeout), whose name is `<resource group>-role-manager`
  truncated to 28 characters plus `-job`, to stay inside the Container App Job 32-character name
  limit.

The role manager is a small Python program (`infra/modules/database/resources/role_manager/`) run
with the `manage` or `check` command; its `manage` path creates Entra users in the `postgres`
database first (Azure requires it), then configures the application database's roles, schema, and
privileges.

### Database roles and the table-permissions gotcha

All database access authenticates via Entra ID, so there are no long-lived credentials to store or
rotate. The role manager, running as an admin, creates two Postgres roles
(`docs/infra/database-access-control.md`):

- **`migrator`** — assumed by the migration task; may create tables in the `app` schema. Migrations
  run as part of the deploy workflow, before the new container image is deployed to the service.
- **`app`** — assumed by the application service; has read/write permissions in the `app` schema.

In Postgres, a table created by `migrator` is not automatically accessible to `app` — schema usage
alone is not enough. **The role manager already handles this for you.** Setup step 4
(`bin/create-or-update-database-roles`, which runs the role manager with the `manage` command) calls
`configure_default_privileges()`
(`infra/modules/database/resources/role_manager/src/role_manager/manage.py:45`), which reconnects as
the **migrator** — default privileges can only be altered for the current role — and issues
(`manage.py:250-272`):

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA <DB_SCHEMA> GRANT ALL ON TABLES TO app
ALTER DEFAULT PRIVILEGES IN SCHEMA <DB_SCHEMA> GRANT ALL ON SEQUENCES TO app
ALTER DEFAULT PRIVILEGES IN SCHEMA <DB_SCHEMA> GRANT ALL ON ROUTINES TO app
```

So tables (and sequences and routines) created later by `migrator` are accessible to `app` without
any action in your migrations.

> **Stale instruction in the shipped doc.** `docs/infra/set-up-database.md` ("Important note on
> Postgres table permissions") still tells you to put
> `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app` in your first migration, pointing at the
> example app's `template-only-app/migrations.sql`. That is redundant with the role manager's
> behavior; keep it only as an explicit safeguard, not as a required step.

Connection details for humans are in
[access control and operations](infra-azure-access-control-and-operations.md).

## 2. Set up the application service (per application environment)

The service setup configures a new application environment and creates the application's
infrastructure resources in it (`docs/infra/set-up-app-env.md`).

**Requirements:**

- A compatible application in the app folder (the shipped doc links the platform's application
  requirements).
- The app configured in `infra/<APP_NAME>/app-config/main.tf` — in particular `has_database`.
- For production, sizing tuned in the environment's `app-config/<ENVIRONMENT>.tf`. `prod.tf` ships
  `service_cpu = 1`, `service_memory = "2Gi"`, `service_desired_instance_count = 3`, and
  `service_application_gateway_sku_name = "Standard_v2"`; the `env-config` defaults are `0.25` CPU,
  `0.5Gi`, `0` instances, and the `Basic` gateway SKU. Consider a load test if the application is
  performance sensitive. Azure constrains which CPU and memory combinations a Container App may
  request; see the [Container Apps workload profile
  documentation](https://learn.microsoft.com/en-us/azure/container-apps/workload-profiles-overview)
  for the allowed pairs.
- A non-default network for the application, and — when `has_database` is true — the database layer
  already set up.

### Steps

```bash
# 1. Configure the service backend and tfvars (writes the environment's tfbackend)
make infra-configure-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>

# 2. Build and publish the application image. Either trigger the "Build and Publish"
#    workflow from the repo's GitHub Actions tab (needs the GitHub client configuration
#    from account setup), or run locally — which can be much slower depending on your
#    machine's architecture:
make release-build APP_NAME=<APP_NAME>
make release-publish APP_NAME=<APP_NAME>
# copy the published image tag

# 3. Create the service resources with that image tag (review the plan first)
TF_CLI_ARGS_apply="-var=image_tag=<IMAGE_TAG>" \
  make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

Whether the service is configured with database access depends on `has_database` in the app-config
module. As with the role-manager tag, `infra/{{app_name}}/service/image_tag.tf` reads the previous
`image_tag` back out of remote state, so after the first deploy `plan`/`apply` need no variables.

### What the service layer creates

From `infra/modules/service/` and the service root module:

- **Two user-assigned managed identities**, `<service>-app` and `<service>-migrator`, each granted
  `AcrPull` on the container registry and `Key Vault Secrets User` on each of the service's secrets.
  When the app has a database, they are added to the App and Migrator Entra groups respectively
  (with a 30-second sleep to let identity propagation settle).
- **The web Container App** — single revision mode, `Consumption` workload profile, external ingress
  on `container_port` (default `8000`) with HTTP redirected to HTTPS, an HTTP scale rule at 10
  concurrent requests, and `min_replicas` set from `service_desired_instance_count`.
- **A migrations Container App Job** named `<service>-job` — the same image, manual trigger, one
  replica, 3600-second timeout. This is the job `release-run-database-migrations` invokes.
- **A per-service-and-environment Key Vault** (`infra/{{app_name}}/service/secrets.tf`), named
  `<service>-<location>-<project_unique_id>` truncated to Azure's 24 characters, with RBAC
  authorization, monitoring wired to the network's Log Analytics workspace, and a private endpoint in
  the private-endpoints subnet. Secrets are referenced by the Container App at a specific version, so
  a manually rotated secret needs a fresh `terraform apply` to be picked up.
- **Blob storage**, when `has_blob_storage` is true — a Storage Account (name derived from project,
  app, and environment plus a short hash, truncated to 24 characters), a `documents` container, an
  Event Grid system topic publishing storage events, versioning and 30-day soft delete on
  non-temporary environments, `public_network_access_enabled = false` plus a `blob` private endpoint,
  and a `Storage Blob Data Contributor` role assignment for the app's managed identity.
- **The Application Gateway and DNS records**, covered in
  [domains and HTTPS](infra-azure-domains-and-https.md).

The service module injects these environment variables into both the app and the job
(`infra/modules/service/main.tf`): `PORT`, `IMAGE_TAG`, and `AZURE_CLIENT_ID`; when a database is
attached, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, and `DB_SCHEMA`; when blob storage is attached,
`AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_CONTAINER_NAME`; then any `extra_environment_variables`
and one entry per configured secret.

The `AZURE_CLIENT_ID` and `DB_USER` values baked into the job by Terraform are the **app** identity's
(`local.base_environment_variables` in `infra/modules/service/main.tf` builds one map that both the
Container App and the job consume). `bin/run-database-migrations` overrides both per invocation,
passing the service module's `migrator_username` and `migrator_user_client_id` outputs to
`bin/run-app-job`, so migrations actually run as the migrator identity rather than the app's.

## 3. Environment variables and secrets

Applications follow [12-factor app](https://12factor.net/) principles and
[store configuration in environment variables](https://12factor.net/config). The infrastructure
provides some automatically — the identity's client id, database access, and document storage — while
application-specific configuration and secrets are declared in
`infra/<APP_NAME>/app-config/env-config/environment-variables.tf`. (Source:
`docs/infra/environment-variables-and-secrets.md`.)

- **Non-sensitive extras.** Add entries to the `default_extra_environment_variables` map — key is the
  variable name, value is the default across environments (the shipped file shows
  `WORKER_THREADS_COUNT`, `LOG_LEVEL`, `DB_CONNECTION_POOL_SIZE` as commented examples). Override per
  environment by passing `service_override_extra_environment_variables` to the `env-config` module
  from that environment's `app-config/<environment>.tf`. The two maps are merged with the override
  winning (`env-config/service.tf`).
  **Do not put credentials here** — these values are stored in plaintext in the container
  configuration and visible to anyone who can view it.
- **Secrets.** Add entries to the `secrets` map in the same file. The key is the environment variable
  name; `manage_method` is `"generated"` (Terraform creates a random 64-character password and stores
  it) or `"manual"` (Terraform reads an existing secret); `secret_name` is the Key Vault secret name
  written to or read from. For `manage_method = "manual"`, **store the secret in Azure Key Vault
  before** configuring the service, or the deploy fails looking for a name that doesn't exist. For
  generated secrets the module ignores subsequent value changes, so rotating one by hand is not
  reverted (`infra/modules/secret/main.tf`).
  Every service-and-environment combination uses its own Key Vault; referencing secrets in a shared
  vault or shared across a service's environments is
  [not currently supported](https://github.com/navapbc/template-infra-azure/issues/33).

> `docs/infra/environment-variables-and-secrets.md` still describes the AWS implementation in places
> — "ECS task role", "ECS task definition's container definitions". On Azure the equivalents are the
> user-assigned managed identity and the Container App's environment and secret blocks; the
> configuration surface described above is accurate.

## 4. Background jobs

Background jobs are handled by [Azure Container App
Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs?tabs=azure-cli). The shipped doc
distinguishes (`docs/infra/background-jobs.md`):

- jobs on a fixed schedule — useful for ETL that cannot be event-driven, such as ingesting files
  from an SFTP server or a storage location another team controls;
- jobs triggered by an event (for example a file uploaded to document storage), served either by
  tasks that spin up on demand — appropriate for low-frequency ETL — or by continuously running
  worker tasks draining a queue, which suits high-frequency low-latency work like processing user
  uploads or submitting claims to an unreliable legacy system. **The worker-task pattern is not yet
  implemented.**

Today a **single manually triggered Container App Job** is created by default, used to run
migrations. There is not yet a simpler interface for configuring additional jobs; add your own
`azurerm_container_app_job` resources in `infra/{{app_name}}/service`.

## Deploying ongoing changes

To roll out a new application image to an environment, use the release targets —
`release-build` → `release-publish` → `release-run-database-migrations` → `release-deploy` — which
are normally driven by CI/CD. Migrations run as the `migrator` role before the new image is deployed
to the service, which runs as `app`. See [making infra changes](infra-azure-making-changes.md) for
the full release pipeline and the Terraform wrapper scripts, and
[access control and operations](infra-azure-access-control-and-operations.md) for testing changes in
an isolated workspace first.
