---
id: infra-configuration
title: Configuration — Project Config, App Config, Env Vars, and Secrets
source: template-infra
doc_type: guide
tags: [infra, configuration, terraform, environment-variables, secrets]
related: [infra-overview, infra-module-architecture, infra-getting-started, infra-database, infra-security-monitoring]
summary: How the template configures itself from static project-config and app-config modules, and how to add application environment variables and secrets.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - docs/infra/infrastructure-configuration.md
    - docs/infra/environment-variables-and-secrets.md
    - infra/project-config/README.md
    - infra/project-config/aws_services.tf
    - infra/project-config/networks.tf
    - infra/project-config/system_notifications.tf
    - infra/project-config/threat_detection.tf
    - infra/project-config/outputs.tf
    - infra/project-config/main.tf.jinja
    - infra/{{app_name}}/app-config/main.tf
    - infra/{{app_name}}/app-config/dev.tf
    - infra/{{app_name}}/app-config/outputs.tf
    - infra/{{app_name}}/app-config/env-config/variables.tf
    - infra/{{app_name}}/app-config/env-config/feature_flags.tf
    - docs/infra/system-notifications.md
    - docs/decisions/infra/2023-09-07-consolidate-infra-config-from-tfvars-files-into-config-module.md
last_documented: 2026-09-04
verified: ok
---

# Configuration — Project Config, App Config, Env Vars, and Secrets

The template derives all of its configuration from two **static configuration modules** rather than
from Terraform `.tfvars` files (`docs/infra/infrastructure-configuration.md`). This doc covers both
config modules and how to add application environment variables and secrets. `{{app_name}}` is a
placeholder for your application's folder.

## Static config modules

The configuration sources are:

- **Project config** — `infra/project-config/` — project-wide values: project name, owner, code
  repository URL, default region and the GitHub Actions role name (`main.tf`, shipped in the template
  as `main.tf.jinja` and rendered from your copier answers), the network definitions (`networks.tf`),
  the AWS services GitHub Actions may manage (`aws_services.tf`), CI/CD system notification settings
  (`system_notifications.tf`), and the account's GuardDuty defaults (`threat_detection.tf`). Each of
  those is a `locals` block re-exported from `outputs.tf`. `outputs.tf` also derives values of its
  own rather than only re-exporting: the `default_tags` map is built there from the `main.tf` locals
  plus `terraform.workspace`, and `code_repository` is regexed out of the repository URL.
- **App config** — `infra/{{app_name}}/app-config/`, with a nested `env-config/` module for
  per-environment values — per-application settings and per-environment overrides.

`app-config/main.tf` is where the application's coarse-grained toggles live as locals. They split
into two groups by how they reach the rest of the infra:

- **Passed into `env-config`** — `has_database`, `has_incident_management_service`,
  `enable_identity_provider`, `enable_storage_malware_scanning`, `enable_notifications`,
  `enable_sms_notifications`, and `enable_document_data_extraction`. Each of `dev.tf`, `staging.tf`,
  and `prod.tf` instantiates the `env-config` module and passes these through as `local.*` alongside
  genuinely per-environment values (`network_name`, `domain_name`, `enable_https`, and any
  overrides). So by default a toggle in `main.tf` applies to every environment; to vary one by
  environment, pass a literal value in that environment's file instead of the `local.*` reference.
- **Application-wide, not per environment** — `has_external_non_aws_service`, `enable_waf`, and
  `shared_network_name`. `env-config/variables.tf` declares no variables for these and no
  environment file passes them; they are surfaced only through `app-config/outputs.tf`, so they
  cannot be overridden per environment this way.

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
  execution, feature flags (`env-config/feature_flags.tf`) →
  [infra-capabilities](infra-capabilities.md).
- GitHub Actions permissions are controlled by `project-config/aws_services.tf` →
  [infra-security-and-access](infra-security-and-access.md).
- `enable_threat_detection` / `threat_detection_finding_publishing_frequency`
  (`project-config/threat_detection.tf`) and `enable_storage_malware_scanning` →
  [infra-security-monitoring](infra-security-monitoring.md).
- CI/CD system notifications (`project-config/system_notifications.tf`) define named channels that
  the CI/CD workflows post to; each channel sets a `type` (only `slack` is supported today) plus the
  GitHub secret names holding the Slack channel id and bot token. A channel whose `type` is unset is
  a no-op, which is how the shipped `workflow-failures` channel starts out
  (`docs/infra/system-notifications.md`).
