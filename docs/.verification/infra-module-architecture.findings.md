# Verification findings: infra-module-architecture (round 2)

- Doc: `docs/sources/template-infra/infra-module-architecture.md`
- Source checkout: `.sources/template-infra` @ 80a7cc8ec802c442098933f65280175b8453c659
- Round: 2 (2026-07-21) — post-fix verification

## Summary

The doc is fully accurate and well-supported by the source. Round 1 finding (the `(web-app)` 
parenthetical in the calling structure) has been fixed. All major claims — root/child module 
split, layer table, dependency order, layer-placement guidelines, the WAF split, the domain 
layer configuration, the ADR rationale, and the Make/wrapper/CLI workflow — are verified as 
accurate.

## Findings

No findings. The doc is fully supported by the source.

## Verification log

- **Module calling structure** (line 45–47): Verified each calling relationship against actual 
  Terraform code. `accounts` → `terraform-backend-s3` + `auth-github-actions` 
  (`accounts/main.tf:44–54`); `networks` → `network` + `domain` (`networks/main.tf.jinja:98–117`); 
  `build-repository` → `container-image-repository` (`build-repository/main.tf:57–62`); 
  `database` → `database` (`database/main.tf:49–56`); `service` → `service` 
  (`service/main.tf:74–159`). ✓

- **Child-module list** (lines 40–43): Verified all named modules exist in `infra/modules/` and 
  used by calling root modules. Doc says "including", so the omission of 
  `identity-provider-client`, `notifications-email-domain`, `notifications-phone-pool`, and 
  `notifications-sms` is acceptable. ✓

- **Layers table** (lines 50–57): Verified each layer description against source:
  - Account: terraform backend S3 + GitHub OIDC (`accounts/main.tf:44–54`) ✓
  - Network: VPC, subnets, VPC endpoints, WAF (`network/resources/`) ✓
  - Build-repository: ECR (`container-image-repository/`) ✓
  - Database: Aurora + role manager (`database/resources/main.tf`, `role_manager.tf`) ✓
  - Service: ECS + load balancer + DNS (`service/main.tf`, `dns.tf`) ✓

- **WAF behavior** (lines 54, 90–93): Network module creates `aws_wafv2_web_acl.main` 
  unconditionally (`network/resources/waf.tf:3`, no count/for_each). Service association 
  gated by `count = var.enable_waf ? 1 : 0` (`service/waf.tf:1–5`). ✓

- **Domain/manage_dns** (lines 54, 115–124): Networks root module calls domain module with 
  `manage_dns = local.domain_config.manage_dns` (`networks/main.tf.jinja:107–117`). Domain 
  module creates Route 53 zone conditionally: `count = var.manage_dns ? 1 : 0` 
  (`domain/resources/main.tf:14–19`). ✓

- **Dependency order** (lines 65–75): Verified against source dependency diagram 
  (`module-architecture.md:69–73`): account first (S3 backend), build-repository next, network 
  and database before service, service depends on account (OIDC/IAM). ✓

- **Config modules** (lines 59–61): Verified that project-config and app-config are applied 
  as root modules and called as child modules, with no resource creation 
  (`project-config/main.tf`, `app-config/main.tf`). ✓

- **Layer-placement guidelines** (lines 78–93): Verified against source 
  (`module-architecture.md:76–88`): default service, cardinality, AWS uniqueness, policy 
  constraints, out-of-band dependencies. ✓

- **ADRs** (lines 95–104): Verified all four cited ADRs exist with matching dates and 
  descriptions. ✓

- **Make targets and CLI workflow** (lines 107–124): Verified against making-infra-changes.md 
  (lines 13–41): `infra-update-current-account`, `infra-update-network`, 
  `infra-update-app-service`, `infra-update-app-build-repository`, `TF_CLI_ARGS`, wrapper 
  scripts (`bin/terraform-init`, `bin/terraform-apply`, `bin/terraform-init-and-apply`). ✓
