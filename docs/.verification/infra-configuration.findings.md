# Verification findings — infra-configuration (round 1)

- Doc: `docs/sources/template-infra/infra-configuration.md`
- Source checkout: `.sources/template-infra`
- Result: **No findings.** The doc is fully supported by the source.

## Claims checked and confirmed

1. "Derives all configuration from two static configuration modules rather than `.tfvars`."
   - Supported: `docs/infra/infrastructure-configuration.md:5-10` (config modules) and the
     "Benefits of config modules over variable definitions (.tfvars) files" section (lines 34-40).

2. Both config modules used as (a) child modules and (b) root modules read via
   `terraform apply -auto-approve` then `terraform output`.
   - Supported: `docs/infra/infrastructure-configuration.md:10-22`.

3. Static-output invariants (constant/deterministic outputs, no dependence on env/workspace/
   timestamp, no side effects, `-auto-approve` is safe).
   - Supported: `docs/infra/infrastructure-configuration.md:24-32`.

4. Service name convention `"${var.app_name}-${var.environment}"`.
   - Supported verbatim: `docs/infra/infrastructure-configuration.md:38`.

5. "Risk of applying the wrong `.tfvars` to a backend ... same root module reused across
   multiple backends."
   - Supported: `docs/infra/infrastructure-configuration.md:40`.

6. ADR `2023-09-07-consolidate-infra-config-from-tfvars-files-into-config-module.md` exists and
   is about consolidating config into a config module.
   - Supported: `docs/decisions/infra/2023-09-07-consolidate-infra-config-from-tfvars-files-into-config-module.md:1`.

7. Project config holds account/region defaults, resource tags, networks (`networks.tf`),
   AWS services GitHub Actions may manage (`aws_services.tf`), CI/CD system notifications
   (`system_notifications.tf`).
   - `default_region`: `infra/project-config/main.tf.jinja:15`, `infra/project-config/outputs.tf:15-17`.
   - `default_tags`: `infra/project-config/outputs.tf:19-28`.
   - `networks.tf` (network_configs): `infra/project-config/networks.tf`.
   - `system_notifications.tf` "used by CI/CD workflows": `infra/project-config/system_notifications.tf:3-5`.
   - "AWS services GitHub Actions may manage" / "GitHub Actions permissions controlled by
     aws_services.tf": confirmed — `aws_services` is fed to the GitHub Actions IAM allowed
     actions in `infra/accounts/main.tf:49-53`
     (`allowed_actions = [for aws_service in module.project_config.aws_services : "${aws_service}:*"]`).
   - Note: "account defaults" is a slight editorial synthesis — project-config has `default_region`
     (region default) and `account_name` fields nested in `network_configs` (networks.tf), but no
     separate "account defaults" concept is named in the source docs. The characterization is
     not inaccurate but is an inference.

8. App config at `infra/{{app_name}}/app-config/` with nested `env-config/` module for
   per-environment values.
   - Supported: directories exist (`infra/{{app_name}}/app-config/`,
     `infra/{{app_name}}/app-config/env-config/`); `dev.tf:2` uses `source = "./env-config"`.

9. Add non-sensitive env vars via `default_extra_environment_variables` in
   `infra/{{app_name}}/app-config/env-config/environment_variables.tf`; override per env via
   `service_override_extra_environment_variables` from `app-config/<environment>.tf`.
   - Supported: `docs/infra/environment-variables-and-secrets.md:11-37` and the file
     `infra/{{app_name}}/app-config/env-config/environment_variables.tf` (example entries
     are commented out in source but match the source doc's illustrative examples).
   - Warning that values are embedded in the ECS task definition and visible: source line 9.

10. Secrets sourced from SSM Parameter Store as `SecureString`, declared in the `secrets` map
    in the same `environment_variables.tf`; `generated` vs `manual` `manage_method` semantics
    with `secret_store_name`; warning to store `manual` secrets in SSM before use.
    - Supported: `docs/infra/environment-variables-and-secrets.md:39-62` and
      `infra/{{app_name}}/app-config/env-config/environment_variables.tf:12-33`.
