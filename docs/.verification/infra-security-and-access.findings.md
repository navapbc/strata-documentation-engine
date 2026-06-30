# Verification findings: infra-security-and-access (round 1)

- Doc: `docs/sources/template-infra/infra-security-and-access.md`
- Source checkout: `.sources/template-infra`
- Round: 1
- Result: **No findings.** All claims in the doc are supported by the source.

## Claims checked against source

| Claim in doc | Source evidence | Verdict |
| --- | --- | --- |
| Account layer creates GitHub Actions OIDC provider + IAM role/policy for CI/CD | `docs/infra/set-up-aws-account.md` lines 6-7 (steps 2-3) | Supported |
| Set up via `make infra-set-up-account ACCOUNT_NAME=...`; verified via `make infra-check-github-actions-auth ACCOUNT_NAME=...` | `docs/infra/set-up-aws-account.md` lines 36, 46 | Supported |
| Custom OIDC implementation chosen over Terraform Registry module; module pulled unofficial single-maintainer dependency, exposed unnecessary options including ability to attach `AdministratorAccess`, harder to audit | `docs/decisions/infra/2022-10-05-use-custom-implementation-of-github-oidc.md` lines 25, 33-35 | Supported |
| Since ~July 2023, AWS validates GitHub OIDC IdP via trusted root CAs, legacy thumbprints no longer needed | Same ADR, line 36 ("Update: July 12, 2023" / "Starting July 6, 2023... legacy thumbprint(s) no longer needed") | Supported |
| CI/CD permissions driven by AWS-services list in `infra/project-config/aws_services.tf`; add/remove a service then `make infra-update-current-account` | `docs/infra/cloud-access-control.md` lines 3, 7; `docs/infra/set-up-aws-account.md` line 54 | Supported |
| WAF attaches to ALB; uses AWS Common Rule Set (OWASP-Top-10/SQLi/XSS) and AWS Known Bad Inputs Rule Set | `docs/infra/web-application-firewall.md` lines 13-14 | Supported |
| WAF created in network layer, associated in service layer, disabled by default | `docs/infra/web-application-firewall.md` lines 16, 22-23 | Supported |
| Enable via `enable_waf = true` in app-config, then `make infra-update-network`, then `make infra-update-app-service` | `docs/infra/web-application-firewall.md` lines 24-43 | Supported |
| Verify WAF with curl expecting HTTP 403 (XSS payload) | `docs/infra/web-application-firewall.md` lines 48-53 | Supported (exact match) |
| WAF logs to CloudWatch log group `aws-waf-logs-<NETWORK_NAME>` | `docs/infra/web-application-firewall.md` line 67 | Supported |
| Migration: create at network layer first or keep `enable_waf = false` during transition | `docs/infra/web-application-firewall.md` lines 71-74 | Supported |
| Custom domains create Route 53 hosted zone + DNS A records to load balancer | `docs/infra/custom-domains.md` lines 5-6 | Supported |
| Set `hosted_zone` in `domain_config` in `infra/project-config/networks.tf` | `docs/infra/custom-domains.md` lines 12-14 | Supported |
| `make infra-update-network` creates hosted zone; delegate via NS record; verify with `nslookup -type=NS` | `docs/infra/custom-domains.md` lines 20-52 | Supported |
| `domain_name` per environment must equal hosted zone or a subdomain; `make infra-update-app-service` creates A records | `docs/infra/custom-domains.md` lines 55-65 | Supported |
| `network_configs[*].domain_config.manage_dns = false` for externally managed DNS | `docs/infra/custom-domains.md` line 73 | Supported |
| Custom domains excluded from temporary environments | `docs/infra/temporary-environments-and-out-of-band-resources.md` lines 48, 54 | Supported |
| HTTPS requires custom domains first; issues ACM SSL/TLS cert per domain, associates with load balancer | `docs/infra/https-support.md` lines 5-6, 10 | Supported |
| HTTPS steps: `source = "issued"`, `make infra-update-network`, check cert status via `aws acm describe-certificate`, `enable_https = true`, `make infra-update-app-service` | `docs/infra/https-support.md` lines 14-39 | Supported |

## Notes

- Minor wording differences (doc "OWASP-Top-10-style" vs source "OWASP Top 10 vulnerabilities") are faithful paraphrases, not inaccuracies.
- Doc cross-links to sibling docs (`infra-configuration`, `infra-environments-and-workspaces`, `infra-database`) are appropriate internal references.
