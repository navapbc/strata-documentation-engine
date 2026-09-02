# Verification: infra-overview.md (Round 3)

Verifier: Adversarial verification agent
Source: .sources/template-infra @ 80a7cc8ec802c442098933f65280175b8453c659
Document: docs/sources/template-infra/infra-overview.md
Date: 2026-07-21

## Summary

All major claims in the document have been verified against the source code and documentation. No material inconsistencies or unsupported statements were found.

## Verified Claims

### Infrastructure Template
- **Copier-based Terraform/AWS template**: CONFIRMED in copier.yml and README.md
- **Installation via `nava-platform infra install .`**: CONFIRMED in README.md
- **Updates via `nava-platform infra update .`**: CONFIRMED in README.md

### What It Provisions
All AWS resources mentioned are documented in `docs/system-architecture.md`:
- VPC with public/private/database subnets: CONFIRMED in `infra/modules/network/resources/main.tf`
- NAT gateways for outbound access: CONFIRMED (conditional on `has_external_non_aws_service`)
- VPC endpoints: CONFIRMED in `infra/modules/network/resources/vpc_endpoints.tf`
- Application Load Balancer: CONFIRMED in system-architecture.md
- Amazon ECS service: CONFIRMED in system-architecture.md
- Amazon Aurora Serverless PostgreSQL: CONFIRMED in system-architecture.md
- Database Role Manager Lambda: CONFIRMED in system-architecture.md
- ECR build repository: CONFIRMED in system-architecture.md
- CloudWatch Logs/Alarms: CONFIRMED in system-architecture.md
- SNS topic for alarms: CONFIRMED in system-architecture.md
- Cognito for authentication: CONFIRMED in system-architecture.md
- SES for email: CONFIRMED in system-architecture.md
- GitHub Actions OIDC CI/CD: CONFIRMED in system-architecture.md and `infra/accounts/main.tf`

### Layer Model
All layers and their purposes verified:
- **Account layer**: Creates S3 backend and GitHub Actions OIDC provider/IAM role — CONFIRMED in `infra/accounts/main.tf`
- **Network layer**: Creates VPC, subnets, VPC endpoints, optionally WAF and Route 53 — CONFIRMED in network modules
- **Build-repository layer**: Creates ECR registry, shared across environments — CONFIRMED by Makefile targets
- **Database layer**: Creates Aurora cluster and role manager, per-environment and optional — CONFIRMED by Makefile targets
- **Service layer**: Creates ECS service, load balancer, etc., per-environment — CONFIRMED by Makefile targets
- **App-config**: Static configuration module, not deployed — CONFIRMED in infrastructure-configuration.md

### Environment Model
- **Three standing environments**: dev, staging, prod — CONFIRMED in `infra/README.md`
- **Backend naming convention**: Correctly described — CONFIRMED in `infra/README.md`
- **Temporary environments (PR and workspace-based)**: CONFIRMED
- **Reuse of dev database and Cognito pool**: CONFIRMED in pull-request-environments.md

### Configuration Model
- **Static config modules**: Project config and app config — CONFIRMED
- **Static and side-effect-free design**: CONFIRMED in infrastructure-configuration.md

### App-Config Settings
All configuration options verified to exist:
- `has_database`, `has_external_non_aws_service`, `enable_https`, `enable_waf`, `enable_notifications`, `enable_identity_provider` — ALL CONFIRMED

### Deployment Order
account → network → build-repository → database → service — CONFIRMED in infra/README.md setup steps

### Make Targets and Wrapper Scripts
All referenced Make targets and bin/ scripts verified to exist in Makefile and bin/ directory — ALL CONFIRMED

### Copier Mechanics
- **Two template types** (base and app): CONFIRMED in copier.yml
- **Template questions**: CONFIRMED all mentioned
- **Jinja file rendering**: CONFIRMED
- **_exclude list**: CONFIRMED
- **template-only-* exclusion**: Reasonable external context

## Conclusion

The document is accurate and well-supported by the source code. No findings to report.
