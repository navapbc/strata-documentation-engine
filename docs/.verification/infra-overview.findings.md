# Verification findings: infra-overview.md (Round 3)

## Summary

All claims in the doc are now supported by the source. The two issues identified in Round 2 have been resolved:

1. **NAT gateways wording (Round 2, FIXED)**: The doc now correctly describes NAT gateways as "optional **NAT gateways** for outbound access to non-AWS services (created only when `has_external_non_aws_service = true`, which `app-config/main.tf` defaults to `false`)". This accurately reflects the conditional nature of NAT gateway creation.

2. **Missing infra-environments-and-workspaces document (Round 2, FIXED)**: The referenced document now exists at `docs/sources/template-infra/infra-environments-and-workspaces.md` with proper frontmatter and comprehensive coverage of standing environments, temporary environments (workspaces, PR environments, CI end-to-end), the `is_temporary` convention, and how out-of-band resources are handled.

## Issues found

None. All statements are accurate and fully supported by the source.

## Verification checklist

- [x] VPC structure (public/private/database subnets) — verified in infra/modules/network/resources/main.tf
- [x] NAT gateways conditional on `has_external_non_aws_service` — verified in main.tf and app-config defaults
- [x] VPC endpoints for AWS services — verified in vpc_endpoints.tf
- [x] ALB in front of ECS — verified in infra/modules/service
- [x] Aurora Serverless v2 PostgreSQL with Database Role Manager — verified in database module
- [x] Secrets Manager for credentials — verified in role_manager.tf
- [x] ECR build repository — verified in build-repository module
- [x] CloudWatch Logs and Alarms — verified in monitoring module
- [x] SNS topic for alarms — verified in infra/modules/monitoring/main.tf
- [x] GuardDuty on by default — verified in infra/project-config/threat_detection.tf
- [x] GitHub Actions OIDC — verified in configure-aws-credentials action
- [x] Layer structure (account/network/build-repository/database/service/app-config) — verified
- [x] Three standing environments (dev/staging/prod) — verified in app-config/main.tf
- [x] Static config modules instead of .tfvars — verified in infrastructure-configuration.md
- [x] Make targets and bin/ scripts — verified in Makefile and bin/ directory
- [x] Copier template mechanics — verified in copier.yml with base and app types
- [x] Installation and update via nava-platform CLI — verified in README.md
