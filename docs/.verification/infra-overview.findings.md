# Verification findings: infra-overview (round 2)

Doc: `docs/sources/template-infra/infra-overview.md`
Source checkout: `.sources/template-infra`
Verifier: adversarial verifier, round 2
Result: **No findings.** The doc is fully supported by the source.

## Round-1 finding re-checked (now resolved)

Round 1 raised one finding: the "Copier mechanics" section conflated the copier `_exclude`
mechanism with the `template-only-*` exclusion (the latter is applied by platform-cli, not
`copier.yml`). The current doc (lines 137-141) now separates the two:

> "Files listed under `copier.yml`'s `_exclude` (`README.md`, `LICENSE.md`, `copier.yml`, etc.)
> are **not** rendered. Separately, `template-only-*` paths are excluded by the Nava Platform CLI,
> which applies a `*template-only*` source-exclude, so they too never reach a generated project."

Confirmed against source: `copier.yml` lines 103-114 (`_exclude` block contains no `template-only`
entry), and the four `template-only-*` directories exist in the tree but are absent from
`copier.yml`. The fix accurately attributes their exclusion to the CLI. Finding resolved.

## Claims checked and confirmed

- **Install/update via Nava Platform CLI** (`nava-platform infra install .` / `update .`) —
  `README.md` lines 60-70, 94-99.
- **"What it provisions" list** (nondefault VPC + public/private subnets + DB subnets, NAT gateways,
  VPC endpoints, ALB, ECS service, Aurora Serverless PostgreSQL, Database Role Manager Lambda,
  Secrets Manager, ECR build repository, CloudWatch Logs/Alarms, alarms SNS topic to incident
  management, Cognito, SES, Terraform backend S3, GitHub Actions OIDC CI/CD) —
  `docs/system-architecture.md` lines 7-24 and `README.md` lines 28-38.
- **"Aurora Serverless v2"** — `infra/modules/database/resources/main.tf` uses
  `engine = "aurora-postgresql"`, `serverlessv2_scaling_configuration` (line 56), and
  `instance_class = "db.serverless"` (line 75). The "v2" qualifier is corroborated by the module
  (system-architecture.md says only "Aurora Serverless"), so this is accurate, not a finding.
- **Layer (root-module) model** — account / network / per-app build-repository, database, service,
  plus app-config as a static (non-deployed) config module. `infra/README.md` lines 41-49, dir
  structure lines 9-26; account layer (`terraform-backend-s3` state bucket + `auth-github-actions`
  OIDC/IAM) confirmed in `infra/accounts/main.tf` lines 44-54.
- **Deployment order** account -> network -> build-repository -> database -> service — a valid
  topological order of the dependency graph in `docs/infra/module-architecture.md` lines 60-74.
- **build-repository shared across environments (no ENVIRONMENT param)** — `Makefile`
  build-repository targets use the `shared` backend with no `ENVIRONMENT` check (174-176, 202-204).
- **Environment model + `.tfbackend` naming** (`dev.s3.tfbackend`, `shared.s3.tfbackend`,
  `<account name>.<account id>.s3.tfbackend`) — `infra/README.md` line 59.
- **Temporary environments reuse the dev database and Cognito pool** —
  `docs/infra/pull-request-environments.md` lines 16, 25.
- **Configuration model** (project-config + app-config with nested env-config; static and
  side-effect-free; usable as both root and child modules via `terraform apply -auto-approve` +
  `terraform output`) — `docs/infra/infrastructure-configuration.md` lines 5-39. project-config
  outputs (`aws_services`, `default_region`, `default_tags`, `network_configs`,
  `system_notifications_config`, `owner`, `project_name`) cover the listed project-wide settings
  (`infra/project-config/outputs.tf`). App-config toggles `has_database`,
  `has_external_non_aws_service`, `enable_https`, `enable_waf`, `enable_notifications`,
  `enable_identity_provider` confirmed under `infra/{{app_name}}/app-config/`.
- **All Make targets and parameters in the table** — verified in `Makefile`:
  `infra-set-up-account ACCOUNT_NAME` (167), `infra-configure-network`/`infra-update-network` both
  require `NETWORK_NAME` (171, 198), build-repository targets require `APP_NAME` (175, 203),
  database targets require `APP_NAME`+`ENVIRONMENT` (179-181, 207-210),
  `infra-update-app-database-roles`/`infra-check-app-database-roles` (217, 238), service targets
  (189-192, 222-226), `release-build`/`release-publish`/`release-run-database-migrations`/
  `release-deploy` (308-325), `infra-check-github-actions-auth ACCOUNT_NAME` (247),
  `infra-lint`/`infra-format`/`infra-check-compliance` (checkov + tfsec, 244, 251-255)/
  `infra-test-service` (Terratest via gruntwork-io/terratest in `infra/test/go.mod`).
- **Wrapper scripts** `bin/terraform-init`, `bin/terraform-apply`, `bin/terraform-init-and-apply` —
  all present in `bin/`.
- **Copier mechanics** — `copier.yml` defines `base`/`app` template types with the cited questions
  (`base_project_name`, `base_owner`, `base_default_region`, `app_name`, `app_local_port`);
  `_exclude` lists `/README.md`, `/LICENSE.md`, `/copier.yml`, etc.; `.jinja` files (9) and an
  `{{app_name}}/` directory exist.
- **WAF created in the network layer, associated in the service layer, optional** —
  `docs/infra/web-application-firewall.md` lines 5, 7, 16, 27. **VPC endpoints in the network
  module** — `infra/modules/network/resources/vpc_endpoints.tf`. **Route 53 hosted zone in the
  network layer** — `domain` module call in `infra/networks/main.tf.jinja` lines 107-117.
