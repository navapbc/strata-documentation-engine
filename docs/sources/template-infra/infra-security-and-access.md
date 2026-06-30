---
id: infra-security-and-access
title: Security and Access — IAM/OIDC, WAF, HTTPS, and Custom Domains
source: template-infra
doc_type: guide
tags: [infra, security, iam, oidc, github-actions, waf, https, dns, route53]
related: [infra-overview, infra-getting-started, infra-configuration, infra-database, infra-capabilities]
summary: How GitHub Actions authenticates to AWS via OIDC and gets scoped permissions, plus the production-launch protections — web application firewall, HTTPS certificates, and custom domains.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: d2b569e3eef126514745b0e0e5d92a8739d0c6f2
  paths:
    - docs/infra/cloud-access-control.md
    - docs/infra/web-application-firewall.md
    - docs/infra/https-support.md
    - docs/infra/custom-domains.md
    - docs/infra/set-up-aws-account.md
    - infra/project-config/aws_services.tf
    - docs/decisions/infra/2022-10-05-use-custom-implementation-of-github-oidc.md
verified: ok
last_documented: 2026-06-29
---

# Security and Access — IAM/OIDC, WAF, HTTPS, and Custom Domains

This doc covers cloud access control plus the production-launch network protections, distilled from
`docs/infra/cloud-access-control.md`, `web-application-firewall.md`, `https-support.md`, and
`custom-domains.md`. `{{app_name}}` and `<NETWORK_NAME>` are placeholders.

## GitHub Actions access to AWS (OIDC + IAM)

The account layer (`infra/accounts/`) creates the GitHub Actions **OpenID Connect (OIDC) provider**
and the **IAM role and policy** that GitHub Actions assumes for CI/CD (`docs/infra/set-up-aws-account.md`).
This is set up by `make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME>`, and verified with
`make infra-check-github-actions-auth ACCOUNT_NAME=<ACCOUNT_NAME>`.

The OIDC provider uses a **custom implementation** rather than a Terraform Registry module (ADR
`2022-10-05`): the registry module pulled in an unofficial single-maintainer dependency, exposed
unnecessary options (including the ability to attach `AdministratorAccess`), and was harder to audit;
the custom version is simpler and fully in the team's control. (Note: since July 2023, AWS validates
GitHub's OIDC IdP via GitHub's trusted root CAs, so legacy thumbprints are no longer needed.)

### Scoping CI/CD permissions

The permissions GitHub Actions gets are determined by the IAM policy in the account layer, driven by
the **list of AWS services** in `infra/project-config/aws_services.tf` (`docs/infra/cloud-access-control.md`).
Add or remove a service from that list to grant or revoke GitHub Actions' access to it, then apply
the account layer (`make infra-update-current-account`). See
[infra-configuration](infra-configuration.md) for the project-config model.

## Web Application Firewall (WAF)

Per `docs/infra/web-application-firewall.md`, the template can attach an AWS WAF web ACL to the
application load balancer. It uses AWS managed rule sets:

- **AWS Common Rule Set** — general OWASP-Top-10-style protection (SQL injection, XSS, etc.).
- **AWS Known Bad Inputs Rule Set** — blocks request patterns associated with exploitation.

WAF is **created in the network layer** and **associated in the service layer**, and is disabled by
default. To enable it:

1. Set `enable_waf = true` in `infra/{{app_name}}/app-config/main.tf`.
2. `make infra-update-network NETWORK_NAME=<NETWORK_NAME>` (creates the WAF; may already exist from
   network setup). The WAF must exist at the network layer before the service layer can find it.
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>` (associates it).

Verify with a request that should be blocked (expect HTTP 403):

```bash
service_endpoint="$(terraform -chdir="infra/${APP_NAME}/service" output -raw service_endpoint)"
curl -k "${service_endpoint}?search=<script>alert(1)</script>"
```

WAF logs go to CloudWatch under the log group `aws-waf-logs-<NETWORK_NAME>`. When adding WAF to an
existing app, create it at the network layer first (or temporarily keep `enable_waf = false` during
the transition).

## Custom domains

Production systems route traffic through custom domains rather than AWS-generated hostnames. The
custom-domain process (`docs/infra/custom-domains.md`) creates an **Amazon Route 53 hosted zone** and
DNS A records pointing at the load balancer:

1. Set `hosted_zone` in the `domain_config` for the network in
   `infra/project-config/networks.tf`. A hosted zone covers the domain and all its subdomains.
2. `make infra-update-network NETWORK_NAME=<NETWORK_NAME>` to create the hosted zone.
3. Delegate DNS at your registrar: add an NS record whose name is the `hosted_zone` and whose value
   is the zone's nameservers, found via
   `terraform -chdir=infra/networks output -json hosted_zone_name_servers`. Verify with
   `nslookup -type=NS <HOSTED_ZONE>`.
4. Set `domain_name` for each environment in app-config (must equal the hosted zone or a subdomain).
5. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>` to create the A
   records.

To manage DNS outside the project, set `network_configs[*].domain_config.manage_dns = false` in
`project-config/networks.tf`. Because DNS requires out-of-band registrar coordination, custom
domains are **excluded** from temporary environments — see
[infra-environments-and-workspaces](infra-environments-and-workspaces.md).

## HTTPS support

HTTPS requires custom domains first, since certificates are issued for specific domains
(`docs/infra/https-support.md`). The process issues an **ACM SSL/TLS certificate** per domain and
associates it with the load balancer:

1. For each domain in the network's `domain_config`, define a certificate config with
   `source = "issued"`.
2. `make infra-update-network NETWORK_NAME=<NETWORK_NAME>` to issue the certificates. Check status
   with `aws acm describe-certificate --certificate-arn <CERTIFICATE_ARN> --query Certificate.Status`.
3. Set `enable_https = true` in `infra/{{app_name}}/app-config/main.tf`.
4. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>` to attach the
   certificate to the load balancer.

## See also

- Database access control (IAM auth, Secrets Manager) is covered in [infra-database](infra-database.md).
- Application secrets in SSM Parameter Store are covered in [infra-configuration](infra-configuration.md).
