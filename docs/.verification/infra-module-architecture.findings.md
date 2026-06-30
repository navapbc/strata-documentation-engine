# Verification findings: infra-module-architecture

- Doc: `docs/sources/template-infra/infra-module-architecture.md`
- Source checkout: `.sources/template-infra`
- Round: 1 (fresh run 2026-06-26)

## Summary

The doc is fully supported by the source. No findings this round.

All cited source files were re-read and corroborate the doc:
`docs/infra/module-architecture.md`, `docs/infra/making-infra-changes.md`, `infra/README.md`,
`infra/accounts/main.tf`, `infra/networks/main.tf.jinja`,
`infra/modules/network/resources/waf.tf`, `infra/modules/service/waf.tf`, and the four cited ADRs.

### Round-2 finding resolved

Round 2 raised one low-severity finding: the networks-row WAF entry said "optional WAF", but the
WAF web ACL is created unconditionally in the network module while only the load-balancer
*association* is optional (service layer, `enable_waf`). The current doc has been revised and now
reads: "a WAF web ACL (always created here; its association with the service load balancer is
optional via `enable_waf` in the service layer)". This matches the source exactly:

- `infra/modules/network/resources/waf.tf` line 3 — `aws_wafv2_web_acl.main` with no
  `count`/`for_each` (always created).
- `infra/modules/service/waf.tf` lines 1-4 — `aws_wafv2_web_acl_association.main`,
  `count = var.enable_waf ? 1 : 0` (the optional part, in the service layer).

Resolved.

## Cross-checks re-run this round

- **Root vs child modules / calling structure:** `accounts/main.tf` calls `terraform-backend-s3`
  + `auth-github-actions`; `networks/main.tf.jinja` calls `../modules/network/resources` (module
  name `network`) + `domain`; `build-repository/main.tf` calls `container-image-repository`;
  `database/main.tf` calls `../../modules/database/resources`; `service/main.tf` calls
  `../../modules/service` (module name `service`). All match the doc. The source's
  module-architecture mermaid labels the service child module `web-app`; the actual dir is
  `service`. The doc writes "`service` (web-app)", reconciling both — acceptable.
- **Child-module list:** every module the doc names exists under `infra/modules/`
  (`terraform-backend-s3`, `auth-github-actions`, `container-image-repository`, `network`,
  `database`, `service`, `monitoring`, `domain`, `identity-provider`, `notifications`,
  `feature_flags`, `secrets`, `storage`, `document-data-extraction`). Doc says "including", so
  omitting `identity-provider-client`, `notifications-email-domain`, `notifications-phone-pool`,
  `notifications-sms` is acceptable.
- **Dependency edges:** source mermaid (`docs/infra/module-architecture.md` lines 69-73) has
  `app/service -> app/build-repository -> accounts`, `app/service -> accounts`,
  `app/service -> app/network`, `app/service -> app/database -> app/network -> accounts`,
  `app/database -> accounts`. Supports "network and database before service", "service depends on
  account", and the build-repository/network independence claim (each has only an edge to
  `accounts`, none between them). Practical order "account -> build-repository -> network ->
  database -> service" is consistent with the source's numbered list (account first, build-repo
  next, app-env layers last).
- **Layers table:**
  - accounts row (S3 backend + GitHub OIDC provider + IAM role/policy) — `accounts/main.tf`
    `module.backend` + `module.auth_github_actions`. Supported.
  - networks row (VPC, subnets, VPC endpoints, WAF ACL, optional Route 53 via `manage_dns`) —
    `networks/main.tf.jinja` calls network + domain modules; `manage_dns` gates the domain module.
    Supported.
  - database row "Aurora cluster + role manager", optional — `modules/database/resources/main.tf`
    `engine = "aurora-postgresql"` (line 32); `role_manager.tf` present. Supported.
  - service row "ECS service, load balancer, DNS" — `modules/service/` has `load_balancer.tf`,
    `dns.tf`. Supported.
- **Config modules** (`project-config`, `app-config`) static, no resources, used as both root and
  child modules — `infra/README.md` line 39. Supported.
- **Choosing-a-layer guidelines** (default to service, match cardinality, AWS uniqueness, policy
  constraints, out-of-band deps) — match `module-architecture.md` lines 80-88 incl. the OIDC /
  VPC-endpoint examples and the database out-of-band-config rationale.
- **Making changes:** Make targets (`infra-update-current-account`, `infra-update-network
  NETWORK_NAME`, `infra-update-app-service APP_NAME/ENVIRONMENT`, `infra-update-app-build-repository
  APP_NAME` with no ENVIRONMENT), `TF_CLI_ARGS`/`TF_CLI_ARGS_apply`, the three `./bin/terraform-*`
  wrapper scripts, and the "init with the right `-backend-config` because root modules are shared"
  note — all confirmed against `making-infra-changes.md` and the `Makefile` (lines 194-226).
- **ADRs:** all four cited ADR files exist with the stated dates/titles and rationale, including the
  database-layer out-of-band-role-setup rationale (`2023-05-25-...separate-layer.md`) and the
  separate-tfbackend-configs rationale (`2023-05-09-...`).

## Findings

None. The doc is fully supported by the source.
