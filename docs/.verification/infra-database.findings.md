# Verification findings: infra-database (round 1)

Doc: `docs/sources/template-infra/infra-database.md`
Source: `.sources/template-infra` @ `80a7cc8ec802c442098933f65280175b8453c659` (matches `source_ref.ref`)

## Result: no findings

Every material claim in the doc is supported by the source checkout.

Checks performed:

- **Provisioning steps (1-5)** — match `docs/infra/set-up-database.md` lines 3-9 (Aurora Serverless
  v2, `app` schema, IAM auth policy, role-manager Lambda, `app`/`migrator` users). Supported.
- **Make targets** (`infra-configure-app-database`, `infra-update-app-database`,
  `infra-update-app-database-roles`, `infra-check-app-database-roles`) — match set-up-database.md
  lines 27, 60, 68, 113; ">5 min" note matches line 57. Supported.
- **Role-manager JSON roles/privileges** (`postgres`, `migrator`, `app`; `app`/`migrator` = `rds_iam`)
  — match set-up-database.md lines 74-91. Supported.
- **`superuser_extensions` map location** — doc claims the map lives in
  `infra/{{app_name}}/app-config/env-config/database.tf` while the upstream `set-up-database.md`
  example (line 40) still points at `main.tf`. Confirmed: grep of the source tree finds the variable
  in `infra/{{app_name}}/app-config/env-config/database.tf`, not `main.tf`. The parenthetical
  correction is accurate. Supported.
- **`ALTER DEFAULT PRIVILEGES` statement** — verbatim match, set-up-database.md line 103; rationale
  matches line 108. Supported.
- **migrator/app role descriptions and deploy ordering** — match
  `docs/infra/database-access-control.md` lines 16-17. Supported.
- **Lambda role-manager ADR rationale** (VPC access, EC2 too costly, ECS adds ECR + image build,
  Python dependency) — match `2023-05-25-provision-database-users-with-serverless-function.md`
  lines 26, 86. Supported.
- **Separate-layer ADR** — `2023-05-25-separate-database-infrastructure-into-separate-layer.md`
  supports the "separate layer so the database can be provisioned before the service layer runs"
  framing (lines 9-33). Supported.
- **Update-the-role-manager commands** — match database-access-control.md lines 31, 37. Supported.
- **Access control / credentials** (RDS + Secrets Manager rotation, password not in TF state, IAM
  auth except master, 15-minute token lifetime) — match database-access-control.md lines 5-8, 21-24.
  Supported.
- **Engine upgrade paths** (immediately vs maintenance window, `allow_major_version_upgrade`,
  `apply_immediately`, `min_capacity` >= 4.0, shared-memory FATAL error, parameter group creation,
  `moved` block) — match `docs/infra/upgrade-database.md` lines 9-111. Supported.
- **Shared-across-temporary-environments claim** (20-40 min provisioning, PR-branch migrations not
  run against shared dev DB, isolate schema changes) — supported by
  `docs/infra/pull-request-environments.md` line 21 and
  `docs/infra/temporary-environments-and-out-of-band-resources.md` lines 20, 39. (Not among the
  doc's listed `source_ref.paths`, but factually accurate to the source repo.)
- **`has_database = false` skip** — supported by `infra/{{app_name}}/app-config/main.tf` line 16 and
  `docs/infra/set-up-app-env.md` line 14.
