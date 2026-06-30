# Verification findings: infra-azure-database-setup (round 1)

Doc: `docs/sources/template-infra-azure/infra-database-setup.md`
Source: `.sources/template-infra-azure`

## Summary

The doc is faithfully and accurately supported by the source. Checked:

- The five-step setup overview (PostgreSQL flexible server, `app` schema, Entra ID
  group, role-manager Container App Job, invoke to create `app`/`migrator` users)
  matches `docs/infra/set-up-database.md` steps 1-5 exactly.
- All Make targets cited exist in `Makefile`: `infra-configure-app-database`,
  `db-role-manager-release-build`, `db-role-manager-release-publish`,
  `infra-update-app-database`, `infra-update-app-database-roles`,
  `infra-check-app-database-roles`.
- The "Lambda function" note (doc lines 34-36) is correct: `set-up-database.md`
  step 4 literally says "role manager Lambda function," while
  `docs/system-architecture.md` lines 18-22 describe the role manager as an Azure
  Container App Job. The doc's correction is accurate.
- The `ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO app` block and rationale
  match `set-up-database.md` verbatim, including the linked `migrations.sql`.
- Access-control section (Entra ID auth, no long-lived credentials; three groups
  DB Admin / Migrator / App; `az account get-access-token --resource-type
  oss-rdbms`; migrator/app role descriptions) matches
  `docs/infra/database-access-control.md`.

## Findings

None. The doc is fully supported by the source.
