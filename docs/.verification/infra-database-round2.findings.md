# Verification findings: infra-database (round 2)

Doc: `docs/sources/template-infra/infra-database.md`
Source: `.sources/template-infra` @ `8b7bc3899c3a9ab1b3441330d72993cd34d21f70`
Verified: 2026-09-04

Reviewed against: `docs/infra/set-up-database.md`, `docs/infra/database-access-control.md`,
`docs/infra/upgrade-database.md`, `docs/infra/pull-request-environments.md`,
`docs/infra/temporary-environments-and-out-of-band-resources.md`, ADRs 2023-05-25 (separate layer,
Lambda decision) and 2023-06-05 (migration architecture).

Checked whether Round 1 findings were addressed in doc updates and whether new issues emerged from
fixing prior rounds.

## Summary

Two new findings identified, both in the "Upgrading the database engine" section:

1. **medium** — The "Immediately" path omits explicit specification of the third required
   `infra-update-app-database` execution after reverting settings (line 127–128).
2. **low** — The "During maintenance window" path uses vague term "apply" instead of explicitly
   naming `infra-update-app-database` command (line 129–136).

Both stem from incomplete translation of source step-by-step instructions into condensed bullet-point
summary form. Most other content remains accurately supported by sources.

## Findings

### 1. **Immediately Upgrade Path: Missing Third infra-update-app-database Execution (Medium)**

**Claim (lines 122–128):**  
"set the new `engine_version`, run `infra-update-app-database` between each change, then revert the
temporary settings."

**Issue:**  
Source `docs/infra/upgrade-database.md` (lines 13–29) enumerates three distinct `make
infra-update-app-database` calls:
- After setting flags and scaling config (line 25)
- After setting engine_version (line 27)
- After undoing changes from step 2 (line 29)

Doc phrase "run `infra-update-app-database` between each change" followed by "then revert the
temporary settings" does not explicitly indicate a third invocation is required after the revert.
Phrase "between each change" is ambiguous and could allow readers to stop after the second run,
omitting the mandatory third execution.

**Failure scenario:** User follows doc, stops after reverting settings without running
`infra-update-app-database` a third time. Terraform state may be inconsistent with actual cluster
state, causing subsequent operations to fail or apply unexpected changes.

**Evidence:**  
Source lines 25, 27, 29 in `docs/infra/upgrade-database.md` show three separate executions.

**Suggested fix:**  
Revise to enumerate all three runs: "...bump `serverlessv2_scaling_configuration` `min_capacity` to
at least 4.0 (lower minimums fail with `FATAL: shared memory segment sizes are configured too
large`), run `infra-update-app-database`, set the new `engine_version`, run `infra-update-app-database`
again, revert the temporary settings from step 2, and run `infra-update-app-database` a final time."

---

### 2. **Maintenance Window Path: Vague "Apply" Omits Explicit Make Command (Low)**

**Claim (lines 129–136):**  
"set the new `engine_version`, and apply (queued for the next maintenance window..."

**Issue:**  
Source `docs/infra/upgrade-database.md` line 86 explicitly requires `make infra-update-app-database`.
Doc uses generic term "apply" which could refer to any `terraform apply`, not specifically the
wrapper command. While "apply" could reasonably include this step, the parallel "Immediately" section
names the command explicitly (`infra-update-app-database`), creating inconsistent instructional
clarity. Imprecision here may confuse users about whether to use the make target or run Terraform
directly.

**Evidence:**  
Source line 86: `5. Run 'make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENV_NAME>'`

**Suggested fix:**  
Replace vague term with explicit command: "...set the new `engine_version`, run `make
infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENV_NAME>` (queued for the next
maintenance window; to apply it right away, change the engine version to match manually in the AWS
Console)."

---

## Verified: Round 1 Findings Status

Round 1 filed four findings (all low):
1. ✓ Separate-layer rationale restatement — **ADDRESSED** (line 41–43 now reads: "so infrequent,
   complex database changes stay out of the application deploy path and each layer is created once,
   in order" with no "out-of-band step" claim)
2. ✓ Maintenance-window scaling step and console override — **ADDRESSED** (line 130–131 now mentions
   `min_capacity` bump and console override option)
3. ✓ Frontmatter paths missing sources — **ADDRESSED** (source_ref.paths lines 13–20 now include
   both `docs/infra/pull-request-environments.md` and
   `docs/infra/temporary-environments-and-out-of-band-resources.md`)
4. ✓ Setup prerequisite (pip) not mentioned — **ADDRESSED** (lines 46–49 now read: "lists two
   prerequisites: [set up the AWS account]... first, and have `pip` installed...")

---

## Verified Accurate (Remaining Content)

✓ Database setup provisions Aurora Serverless v2 PostgreSQL, app schema, IAM policy, role-manager
Lambda, app/migrator users (set-up-database.md §Database setup process)  
✓ Layer is optional when `has_database = false` (set-up-database.md §Important note)  
✓ Separate layer ADR citation and revised rationale (2023-05-25-separate-database-infrastructure-into-separate-layer.md)  
✓ Four make commands with correct arguments (set-up-database.md §Configure backend, Create database
resources, Create Postgres users, Check that database roles)  
✓ Role manager response structure: roles [postgres, migrator, app], with app/migrator in rds_iam
group (set-up-database.md §3 example JSON response)  
✓ `superuser_extensions` location (`env-config/database.tf` line 8) with note that upstream
set-up-database.md still references main.tf (verified in `.sources/template-infra`)  
✓ ALTER DEFAULT PRIVILEGES statement and PostgreSQL table permission rationale (set-up-database.md
§Note on Postgres table permissions)  
✓ Lambda chosen for VPC access, avoiding EC2 cost and ECS complexity (ADR 2023-05-25 §Decision
Outcome)  
✓ Role manager update commands (database-access-control.md §Update the role manager)  
✓ Master postgres password managed by RDS + Secrets Manager, no state exposure (database-access-control.md §Manage postgres master user password)  
✓ IAM authentication, no long-lived credentials, 15-minute token lifetime (database-access-control.md §Database connections)  
✓ Migrations run as part of deploy before new image (database-access-control.md §Database roles and
permissions; ADR 2023-06-05 §Decision Outcome)  
✓ Database shared across PR/workspace temporary environments, 20–40 minute provisioning (pull-request-environments.md §Shared database of pull request environments; temporary-environments-and-out-of-band-resources.md §Strategy 1: Sharing Resources)  
✓ Migrations from PR branch not run against shared database, schema changes isolated (pull-request-environments.md §Isolate database migrations into separate pull requests)  
✓ Scaling config and min_capacity 4.0 requirement (upgrade-database.md §Immediately, §During RDS
maintenance window)

