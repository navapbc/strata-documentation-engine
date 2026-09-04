# Verification findings for infra-azure-set-up-database-and-service

Round 3 adversarial verification against `.sources/template-infra-azure` (ref 474f45e99076d3b72af4ea9d63dd5d6c0aab850f).

## Summary

One minor inaccuracy found in line-range citations. The document correctly identifies issues in the shipped source docs and accurately describes the infrastructure resources, make targets, and Terraform configurations.

## Findings

### Finding 1: Inaccurate line range for role_manager SQL statements

**Claim (line 154-156):**
> Setup step 4 (`bin/create-or-update-database-roles`, which runs the role manager with the `manage` command) calls `configure_default_privileges()` (`infra/modules/database/resources/role_manager/src/role_manager/manage.py:45`), which reconnects as the **migrator** — default privileges can only be altered for the current role — and issues (`manage.py:250-272`):

**Issue:**
The line range `250-272` does not include all three SQL statements being referenced. The SQL statements are on lines 266 (TABLES), 270 (SEQUENCES), and 274 (ROUTINES), so the range should be `250-275` to include the complete function.

**Severity:** Low

**Evidence:**
`infra/modules/database/resources/role_manager/src/role_manager/manage.py` lines 250-275 contain the function definition and all three `ALTER DEFAULT PRIVILEGES` statements.

**Suggested fix:**
Change the citation from `manage.py:250-272` to `manage.py:250-275` to accurately reflect the range of the complete function including all SQL statements.

## Verification notes

✓ All make targets (`infra-configure-app-database`, `db-role-manager-release-build`, `db-role-manager-release-publish`, etc.) confirmed present in Makefile
✓ PostgreSQL version 16 confirmed in `infra/modules/database/resources/main.tf` line 47
✓ Database SKU `B_Standard_B1ms` confirmed in `infra/{{app_name}}/database/main.tf` line 110
✓ Role manager specs (0.5 CPU, 1Gi memory, manual trigger, 3600s timeout) confirmed in `infra/modules/database/resources/role_manager.tf`
✓ Production sizing (1 CPU, 2Gi, 3 instances, Standard_v2 gateway) confirmed in `infra/{{app_name}}/app-config/prod.tf`
✓ Environment variable defaults (0.25 CPU, 0.5Gi, 0 instances, Basic gateway) confirmed in `infra/{{app_name}}/app-config/env-config/variables.tf`
✓ Service environment variables structure confirmed in `infra/modules/service/main.tf`
✓ Document accurately identifies AWS leftovers in shipped source docs (`docs/infra/set-up-database.md`, `docs/infra/environment-variables-and-secrets.md`)
✓ Migration script override of `AZURE_CLIENT_ID` and `DB_USER` confirmed in `bin/run-database-migrations` lines 65-66
✓ Role manager invocation with `["manage"]` command confirmed in `bin/create-or-update-database-roles` line 34
✓ All three Entra security groups (DB Admin, Migrator, App) confirmed created in `infra/modules/database/resources/main.tf`
