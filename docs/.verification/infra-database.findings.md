# Verification findings: infra-database (round 3)

Doc: `docs/sources/template-infra/infra-database.md`
Source: `.sources/template-infra` @ `8b7bc3899c3a9ab1b3441330d72993cd34d21f70`
Verified: 2026-09-04

Reviewed against all referenced sources; assessed whether Round 1 and Round 2 findings were
addressed and identified any remaining issues.

## Summary

Round 1 findings (all low): all four addressed in subsequent edits (separate-layer rationale,
maintenance-window scaling/console override, frontmatter paths, pip prerequisite).

Round 2 findings (2 medium/low): one addressed (Immediately path now explicitly mentions three
`infra-update-app-database` runs), one **not addressed** (maintenance-window path still uses generic
"apply" instead of explicit make command).

**One finding carries forward from Round 2 and remains unresolved.**

## Findings

### 1. **Maintenance-Window Upgrade Path: Vague "apply" Still Not Replaced with Explicit Make Command (Low)**

**Status:** Carries over from Round 2; not addressed in updates.

**Claim (lines 130–137):**  
"...then create a new `aws_rds_cluster_parameter_group` for the new engine family, point the cluster
at it, set the new `engine_version`, and apply (queued for the next maintenance window..."

**Issue:**  
Source `docs/infra/upgrade-database.md` line 86 explicitly requires `make
infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENV_NAME>`. Doc uses generic term "apply"
instead of naming the specific make command. While "apply" could reasonably include the make target,
this inconsistency with the parallel "Immediately" path (which explicitly names `infra-update-app-database`
three times, lines 127–129) creates instructional ambiguity. A reader may mistakenly run `terraform
apply` directly instead of the documented make target.

**Failure scenario:**  
User interprets "apply" as a generic Terraform apply, runs `terraform apply` from a subdirectory,
and either succeeds with unintended side effects or fails due to incorrect working directory or
state file location.

**Evidence:**  
Source `docs/infra/upgrade-database.md`:
- Line 41–46: Step 1–2 of maintenance-window path
- Line 84–86: Step 4–5 explicitly requires `make infra-update-app-database`
- Lines 88–90: Notes the upgrade is queued and can be forced via AWS Console

Doc "Immediately" path (lines 127–129) by contrast uses: "run `infra-update-app-database`",
"`infra-update-app-database` again", "`infra-update-app-database` a final time".

**Suggested fix:**  
Replace "and apply" with explicit command: "...set the new `engine_version`, and run `make
infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENV_NAME>` (queued for the next
maintenance window; to apply it right away, change the engine version to match manually in the AWS
Console)."

---

## Verified: Round 1 and Round 2 Status

### Round 1 (all low) — ALL ADDRESSED ✓
1. ✓ Separate-layer rationale — now states "so infrequent, complex database changes stay out of the
   application deploy path and each layer is created once, in order" (line 41–43)
2. ✓ Maintenance-window scaling/console override — now includes min_capacity bump and notes console
   override (lines 130–131, 134)
3. ✓ Frontmatter paths — updated to include pull-request-environments.md and
   temporary-environments-and-out-of-band-resources.md (source_ref.paths)
4. ✓ Pip prerequisite — now mentions "have `pip` installed" before commands (lines 46–49)

### Round 2 (2 findings) — MIXED STATUS
1. **✓ ADDRESSED** — Immediately path: now explicitly specifies three `infra-update-app-database`
   runs, including "a final time" after revert (lines 127–129). Source sequence is now faithfully
   represented.
2. **✗ NOT ADDRESSED** — Maintenance-window path: still uses vague "apply" instead of the explicit
   `make infra-update-app-database` command. See Finding #1 above.

---

## Verified Accurate (All Other Content)

✓ Database layer optional, per-application (set-up-database.md, docs/infra structure)
✓ Provisions Aurora Serverless v2, app schema, IAM policy, Lambda, app/migrator users
✓ Five setup steps accurately summarized (set-up-database.md §What the database setup provisions)
✓ Four make commands with correct APP_NAME/ENVIRONMENT arguments (set-up-database.md §Configure
backend through §Check that database roles)
✓ Prerequisites: set-up-aws-account, pip installed (set-up-database.md §Requirements)
✓ Role-manager response shape: roles [postgres, migrator, app], app/migrator in rds_iam
(set-up-database.md §3 JSON response)
✓ superuser_extensions location: env-config/database.tf with note about upstream showing main.tf
(verified in `.sources/template-infra/infra/{{app_name}}/app-config/env-config/database.tf`)
✓ ALTER DEFAULT PRIVILEGES statement and rationale (set-up-database.md §Note on Postgres table
permissions)
✓ Lambda chosen for VPC access, avoiding EC2 cost/ECS complexity (ADR 2023-05-25 §Decision Outcome)
✓ Role-manager update commands (database-access-control.md §Update the role manager)
✓ Master password via RDS Secrets Manager, rotated, not in state (database-access-control.md)
✓ IAM auth, no long-lived credentials, 15-minute tokens (database-access-control.md §Database
connections)
✓ Immediately upgrade path: all three `infra-update-app-database` runs now explicit (upgrade-database.md
§Immediately)
✓ Maintenance-window scaling requirement: min_capacity to 4.0 (upgrade-database.md §During RDS
maintenance window, step 2)
✓ Database shared across temporary environments, 20–40 minute provisioning (pull-request-environments.md,
temporary-environments-and-out-of-band-resources.md §Strategy 1)
✓ Migrations not run on shared database, schema changes isolated (pull-request-environments.md
§Isolate database migrations)
