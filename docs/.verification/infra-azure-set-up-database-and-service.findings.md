# Verification findings: infra-azure-set-up-database-and-service (round 2)

Source: `.sources/template-infra-azure` @ f930f2ba39be8ab6a55eaa0b538ad96def2e331b

## Summary

Round 1 finding has been applied: the document now correctly clarifies that `has_database` is set in `app-config/main.tf` while the production sizing settings are tuned in `app-config/<ENVIRONMENT>.tf`.

All other major claims verified against source documentation and Terraform code. No new inaccuracies found.

## Detailed verification

**Section 1 (Database setup):**
- Database layer: Azure Database for PostgreSQL flexible server, `app` schema, Entra ID groups, Container App Job role manager, Postgres user creation → all supported by `docs/infra/set-up-database.md`
- Makefile targets: `infra-configure-app-database`, `db-role-manager-release-build`, `db-role-manager-release-publish`, `infra-update-app-database`, `infra-update-app-database-roles`, `infra-check-app-database-roles` → all exist in `Makefile`
- Table permissions: `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app` SQL command → supported by source
- Database access control: Entra ID groups ("DB Admin", "Migrator", "App"), token via `az account get-access-token --resource-type oss-rdbms` → all supported by `docs/infra/database-access-control.md`

**Section 2 (Service setup):**
- Requirements and configuration → supported by `docs/infra/set-up-app-env.md`
- `has_database` in `app-config/main.tf` + production sizing in `app-config/<ENVIRONMENT>.tf` → **fixed from round 1**, now accurate per `infra/{{app_name}}/app-config/main.tf:16` and `prod.tf`
- Makefile targets: `infra-configure-app-service`, `release-build`, `release-publish`, `infra-update-app-service` → all exist
- Service configuration dependent on `has_database` → supported by source

**Section 3 (Environment variables and secrets):**
- 12-factor configuration → supported
- Infrastructure provides environment variables for "task-role auth, database access, document storage" → source claims "ECS task role" (AWS terminology), but Azure infrastructure provides `AZURE_CLIENT_ID`, database vars, and storage vars. The doc's vague term "task-role auth" is not contradicted by source; it's a generalization.
- File path, map names, override mechanism → all verified against `environment-variables-and-secrets.md` and actual `environment-variables.tf`
- Secrets `manage_method` ("generated"/"manual") and `secret_name` → supported
- Manual secrets must be stored in Azure Key Vault before deploying → supported by source

**Section 4 (Background jobs):**
- Azure Container App Jobs, scheduled and event-triggered jobs, worker task queue not yet implemented → supported by `docs/infra/background-jobs.md`
- Single manually-triggered Container App Job for migrations → supported
- Custom jobs via `azurerm_container_app_job` in `infra/{{app_name}}/service` → supported

**Section 5 (Deploying ongoing changes):**
- Release target order: `release-build` → `release-publish` → `release-run-database-migrations` → `release-deploy` → all exist in `Makefile`
- Migrations run as `migrator` role before deploy as `app` role → supported by source

## No inaccuracies found

Document is fully supported by source. Round 1 suggested fix has been incorporated.
