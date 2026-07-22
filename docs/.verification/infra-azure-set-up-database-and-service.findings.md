# Verification findings: infra-azure-set-up-database-and-service (round 1)

Source: `.sources/template-infra-azure` @ `e10a383c4871d6eab3999baf63a01e5bd5a81f4c` (matches `source_ref.ref`).

## Result: no findings

Every substantive claim in the doc is supported by the cited source files.

Checks performed:

- Database setup 5-step summary — matches `docs/infra/set-up-database.md` steps 1-5 (PostgreSQL
  flexible server, `app` schema, Entra ID group, role-manager Container App Job, create `app`/`migrator` users).
- `has_database = false` skip guidance and `infra/<APP_NAME>/app-config/main.tf` location — confirmed
  (`main.tf` line 16 `has_database = true`).
- All Makefile targets exist: `infra-configure-app-database`, `db-role-manager-release-build`,
  `db-role-manager-release-publish`, `infra-update-app-database`, `infra-update-app-database-roles`,
  `infra-check-app-database-roles`, `infra-configure-app-service`, `infra-update-app-service`,
  `release-build`, `release-publish`, `release-run-database-migrations`, `release-deploy`.
- The "Lambda function" / `<ENVIRONMENT>.s3.tfbackend` AWS-carryover note is accurate — source
  `set-up-database.md` line 59 says "Lambda function" and line 36 names `<ENVIRONMENT>.s3.tfbackend`.
- `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app` and the migrator/app permissions rationale —
  matches `set-up-database.md` and `database-access-control.md`.
- Three Entra groups ("DB Admin", "Migrator", "App"), username=group name, token as password,
  `az account get-access-token --resource-type oss-rdbms` — matches `database-access-control.md`.
- Service-layer requirements (compatible app, `has_database`, per-env sizing in `<ENVIRONMENT>.tf`
  with `service_cpu`/`service_memory`/`service_desired_instance_count`, load test, non-default
  network, database layer) — matches `set-up-app-env.md`; `prod.tf` confirms those three vars.
- Env vars/secrets: `default_extra_environment_variables`, `service_override_extra_environment_variables`,
  `secrets` map with `manage_method` generated/manual and `secret_name`, manual-secret-before-deploy
  warning — matches `environment-variables-and-secrets.md`. The doc's filename
  `env-config/environment-variables.tf` (hyphen) matches the actual file on disk (the source prose
  uses an underscore; the doc's hyphenated form is correct).
- Background jobs: scheduled + event-triggered, worker-queue "not yet implemented", single
  manually-triggered migration job, add `azurerm_container_app_job` in the service module — matches
  `background-jobs.md`.
- Release chain `release-build → release-publish → release-run-database-migrations → release-deploy`
  — matches `releases.md` and Makefile.
