---
id: infra-database
title: Database — Aurora, the Role Manager, and Access Control
source: template-infra
verified: ok
doc_type: guide
tags: [infra, database, postgres, aurora, rds, lambda, iam, terraform]
related: [infra-overview, infra-module-architecture, infra-getting-started, infra-configuration, infra-environments-and-workspaces]
summary: How the database layer provisions Aurora Serverless v2 PostgreSQL, uses a role-manager Lambda to create the app and migrator users, secures access with IAM authentication, and how to upgrade the engine.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 80a7cc8ec802c442098933f65280175b8453c659
  paths:
    - docs/infra/set-up-database.md
    - docs/infra/database-access-control.md
    - docs/infra/upgrade-database.md
    - docs/decisions/infra/2023-05-25-separate-database-infrastructure-into-separate-layer.md
    - docs/decisions/infra/2023-05-25-provision-database-users-with-serverless-function.md
    - docs/decisions/infra/2023-06-05-database-migration-architecture.md
last_documented: 2026-07-21
---

# Database — Aurora, the Role Manager, and Access Control

The database layer (`infra/{{app_name}}/database/`) is an **optional** per-application, per-environment
layer. This doc distills `docs/infra/set-up-database.md`, `docs/infra/database-access-control.md`, and
`docs/infra/upgrade-database.md`. `{{app_name}}` is a placeholder.

## What the database setup provisions

Per `docs/infra/set-up-database.md`, the setup process:

1. Deploys an **Amazon Aurora Serverless v2 PostgreSQL** cluster.
2. Creates a PostgreSQL **`app` schema** for the application's tables.
3. Creates an IAM policy that lets roles connect via **IAM database authentication**.
4. Creates a **role-manager AWS Lambda** function to provision the PostgreSQL users.
5. Invokes the role manager to create the **`app`** and **`migrator`** users.

The layer is skipped entirely for applications without a database (`has_database = false` in
app-config). It is a separate layer (ADR `2023-05-25`, separate database layer) so the database can be
fully provisioned and its roles/schemas configured — an out-of-band step — before the service layer
runs.

## Setting it up

```bash
make infra-configure-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>   # can take >5 min
make infra-update-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
make infra-check-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`infra-update-app-database-roles` invokes the role manager; its response describes the resulting
roles and schema privileges (`postgres`, `migrator`, `app`, with `app`/`migrator` as `rds_iam`).

### Superuser extensions

Most extensions should be enabled through the application's database migrations. Extensions that
require the `rds_superuser` role (e.g. `pgvector`) are enabled via the `superuser_extensions` map in
`infra/{{app_name}}/app-config/env-config/database.tf` (the upstream `set-up-database.md` example
still points at `main.tf`, but in the source tree the map lives in `database.tf`):

```terraform
database_config = {
  superuser_extensions = {
    "vector" : true,
  }
}
```

## Roles and the migrator/app split

Per `docs/infra/database-access-control.md`, the role manager (running as master user `postgres`)
creates two roles:

- **`migrator`** — assumed by the migration task; can create tables in the `app` schema. Migrations
  run as part of the deploy workflow, before the new image is deployed to the service.
- **`app`** — assumed by the application service; has read/write in the `app` schema.

Because new tables in Postgres aren't automatically accessible to non-creator roles, the role manager
runs `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO app` so tables the `migrator`
creates are automatically usable by `app` (`docs/infra/set-up-database.md`).

The migration infrastructure and deploy ordering are covered by ADR `2023-06-05` (database migration
architecture).

## Why a Lambda role manager?

ADR `2023-05-25` (provision database users with a serverless function) chose Lambda because it can
run **inside the VPC** and reach the private database without making the cluster publicly accessible
— avoiding the Terraform/shell-script approach's need to temporarily expose the database. EC2 jump
hosts were too costly for a rarely-used operation, and ECS tasks would add an ECR repository and
image-build step. The trade-off is a Python dependency in the setup process.

### Updating the role manager

To change the role manager's code or dependencies (`docs/infra/database-access-control.md`):

```bash
make infra-module-database-role-manager-archive   # rebuild the Lambda zip
make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>   # deploy it
```

## Access control and credentials

Per `docs/infra/database-access-control.md`:

- The **master `postgres` password** is managed by RDS + AWS Secrets Manager — rotated regularly and
  never stored in Terraform state.
- Connections (except as the `postgres` master) use **IAM database authentication**, so there are no
  long-lived database credentials; IAM-generated auth tokens last 15 minutes.

## Upgrading the database engine

`docs/infra/upgrade-database.md` documents two paths for a major-version upgrade (e.g. Postgres 15 →
16), editing `infra/modules/database/resources/main.tf`:

- **Immediately** — first apply any pending maintenance items to the cluster via the AWS Console,
  then set `allow_major_version_upgrade = true` (on the `aws_rds_cluster` resource) and
  `apply_immediately = true` on both the `aws_rds_cluster` and `aws_rds_cluster_instance` resources, bump
  `serverlessv2_scaling_configuration` `min_capacity` to at least 4.0 (lower minimums fail with
  `FATAL: shared memory segment sizes are configured too large`), set the new `engine_version`, run
  `infra-update-app-database` between each change, then revert the temporary settings.
- **During the maintenance window** — set `allow_major_version_upgrade = true` in the
  `aws_rds_cluster` resource, then create a new `aws_rds_cluster_parameter_group` for the new
  engine family, point the cluster at it, set the new `engine_version`, and apply (queued for the
  next maintenance window). After the upgrade completes, remove the old parameter group, drop
  `allow_major_version_upgrade`, and optionally use a Terraform `moved` block to rename the new
  parameter-group resource back to the original name without recreating it.

## Sharing across temporary environments

The database is **shared** by temporary (PR/workspace) environments rather than provisioned per
environment, because provisioning takes 20–40 minutes. Migrations from a PR branch are not run
against the shared dev database — isolate schema changes into their own PR. See
[infra-environments-and-workspaces](infra-environments-and-workspaces.md).
