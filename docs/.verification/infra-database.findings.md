# Verification findings: infra-database (round 2)

Doc: `docs/sources/template-infra/infra-database.md`
Source checkout: `.sources/template-infra`
Cited source paths (`source_ref.paths`):
- docs/infra/set-up-database.md
- docs/infra/database-access-control.md
- docs/infra/upgrade-database.md
- docs/decisions/infra/2023-05-25-separate-database-infrastructure-into-separate-layer.md
- docs/decisions/infra/2023-05-25-provision-database-users-with-serverless-function.md
- docs/decisions/infra/2023-06-05-database-migration-architecture.md

## Status: No findings

All claims in this document are fully supported by the source material. The findings from Round 1 have been addressed in the current version of the document.

### Round 1 findings — RESOLVED

The two medium-severity findings from Round 1 regarding the database upgrade paths have been fixed:

1. **Immediate upgrade path** — Now correctly begins with "first apply any pending maintenance items to the cluster via the AWS Console" (line 117)
2. **Maintenance window upgrade path** — Now correctly begins with "set `allow_major_version_upgrade = true` in the `aws_rds_cluster` resource, then..." (line 123)

### Verification sweep (Round 2)

Verified the following key claims against source documentation:

- Database provisioning steps and layer optionality — Confirmed in `set-up-database.md`
- Role manager provision of `app`/`migrator` users — Confirmed in `database-access-control.md`
- Superuser extensions configuration location (noted correctly as `database.tf` despite source doc mentioning `main.tf`) — Verified in source tree
- Migration execution timing (before new image deployment) — Confirmed in `database-access-control.md`
- IAM token lifetime (15 minutes) — Confirmed in `database-access-control.md`
- Lambda-based role manager rationale (VPC access, cost/complexity vs EC2/ECS) — Confirmed in ADR 2023-05-25
- Database upgrade immediate and maintenance-window paths — Fully matches `upgrade-database.md` structure
- Shared database for temporary (PR/workspace) environments — Confirmed in `pull-request-environments.md` and `temporary-environments-and-out-of-band-resources.md`
- Database provisioning time (20–40 minutes) — Confirmed in `pull-request-environments.md`
- Migration isolation on shared dev database — Confirmed in `pull-request-environments.md`

All statements are accurate and appropriately sourced.
