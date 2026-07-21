---
id: infra-configuration
title: Configuration — Project Config, App Config, Env Vars, and Secrets
source: template-infra
verified: ok
doc_type: guide
tags: [infra, configuration, terraform, environment-variables, secrets]
related: [infra-overview, infra-module-architecture, infra-getting-started, infra-database]
summary: How the template configures itself from static project-config and app-config modules, and how to add application environment variables and secrets.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 80a7cc8ec802c442098933f65280175b8453c659
  paths:
    - docs/infra/infrastructure-configuration.md
    - docs/infra/environment-variables-and-secrets.md
    - infra/project-config/README.md
    - infra/project-config/aws_services.tf
    - infra/project-config/networks.tf
    - infra/project-config/system_notifications.tf
    - docs/decisions/infra/2023-09-07-consolidate-infra-config-from-tfvars-files-into-config-module.md
last_documented: 2026-07-21
---

# Configuration — Project Config, App Config, Env Vars, and Secrets

The template derives all of its configuration from two **static configuration modules** rather than
from Terraform `.tfvars` files (`docs/infra/infrastructure-configuration.md`). This doc covers both
config modules and how to add application environment variables and secrets. `{{app_name}}` is a
placeholder for your application's folder.

## Static config modules

The configuration sources are:

- **Project config** — `infra/project-config/` — project-wide values: account/region defaults,
  resource tags, the network definitions (`networks.tf`), the AWS services GitHub Actions may manage
  (`aws_services.tf`), and CI/CD system notification settings (`system_notifications.tf`).
- **App config** — `infra/{{app_name}}/app-config/`, with a nested `env-config/` module for
  per-environment values — per-application settings and per-environment overrides.

Both are used two ways (`docs/infra/infrastructure-configuration.md`):

1. As **child modules** called by the layer root modules:

   ```terraform
   module "project_config" { source = "../../project-config" }
   module "app_config"     { source = "../app-config" }
   ```

2. As **root modules** that shell scripts and CI jobs read by running
   `terraform apply -auto-approve` followed by `terraform output`.

### Config modules must be static

Config modules are designed so every output is statically determinable
(`docs/infra/infrastructure-configuration.md`):

- All outputs are constant or derived from constants via deterministic functions.
- Outputs do not depend on the environment, the selected root module/workspace, or the timestamp.
- Config modules have **no side effects** — they create no infrastructure resources, which is why
  `-auto-approve` is safe for them.

Keep these invariants in mind when editing config, or you break the assumption that scripts can read
config by applying the module.

### Why config modules instead of `.tfvars`

Per the doc and ADR `2023-09-07` (consolidate config into a config module):

1. Conventions can be enforced in code, e.g. a service name is always `"${var.app_name}-${var.environment}"`.
2. Scripts and CI can read config via `terraform output` without parsing `.tfvars`.
3. It removes the risk of applying the wrong `.tfvars` to a backend, which is a real hazard given
   that the same root module is reused across multiple backends (see
   [infra-module-architecture](infra-module-architecture.md)).

## Application environment variables

Per `docs/infra/environment-variables-and-secrets.md`, applications follow 12-factor config. The
infrastructure injects some environment variables automatically (ECS task role, database access,
document storage). To add **non-sensitive** custom variables, edit the
`default_extra_environment_variables` map in
`infra/{{app_name}}/app-config/env-config/environment_variables.tf`:

```terraform
locals {
  default_extra_environment_variables = {
    WORKER_THREADS_COUNT = 4
    LOG_LEVEL            = "info"
  }
}
```

To override per environment, pass `service_override_extra_environment_variables` to the `env-config`
module from the environment's `app-config/<environment>.tf` (e.g. `dev.tf`):

```terraform
module "dev_config" {
  source                                       = "./env-config"
  service_override_extra_environment_variables = {
    WORKER_THREADS_COUNT = 1
    LOG_LEVEL            = "debug"
  }
}
```

> These values are embedded in the ECS task definition and are visible to anyone who can view it —
> do not put credentials here. Use secrets instead.

## Secrets

Secrets are sensitive environment variables sourced from AWS SSM Parameter Store as `SecureString`
values and surfaced to the ECS task via the container definition's `secrets`
(`docs/infra/environment-variables-and-secrets.md`). They are declared in the same
`environment_variables.tf` file, in the `secrets` map. Each entry's key is the environment variable
name, and:

- `manage_method = "generated"` — Terraform generates a random secret and stores it at
  `secret_store_name`.
- `manage_method = "manual"` — Terraform reads an existing secret you stored at `secret_store_name`.

```terraform
locals {
  secrets = {
    GENERATED_SECRET = {
      manage_method     = "generated"
      secret_store_name = "/${var.app_name}-${var.environment}/generated-secret"
    }
    MANUALLY_CREATED_SECRET = {
      manage_method     = "manual"
      secret_store_name = "/${var.app_name}-${var.environment}/manually-created-secret"
    }
  }
}
```

> For `manual` secrets, store the value in SSM **before** configuring the service to use it, or the
> ECS task executor can't fetch it and the service won't start.

## Related configuration knobs

Other settings live in the app-config modules and are covered in their own guides:

- `has_database`, `superuser_extensions` → [infra-database](infra-database.md).
- `has_external_non_aws_service`, network/WAF/HTTPS toggles, custom domains →
  [infra-security-and-access](infra-security-and-access.md).
- `enable_notifications`, `enable_identity_provider`, monitoring, background jobs, service command
  execution → [infra-capabilities](infra-capabilities.md).
- GitHub Actions permissions are controlled by `project-config/aws_services.tf` →
  [infra-security-and-access](infra-security-and-access.md).
