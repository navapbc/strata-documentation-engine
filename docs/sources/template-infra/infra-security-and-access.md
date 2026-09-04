---
id: infra-security-and-access
title: Security and Access — IAM/OIDC, WAF, HTTPS, and Custom Domains
source: template-infra
doc_type: guide
tags: [infra, security, iam, oidc, github-actions, waf, https, dns, route53, nat-gateway]
related: [infra-overview, infra-getting-started, infra-configuration, infra-database, infra-capabilities, infra-security-monitoring, infra-environments-and-workspaces]
summary: How GitHub Actions authenticates to AWS via OIDC and gets scoped permissions, plus the production-launch protections — web application firewall, HTTPS certificates, custom domains — and how to grant the service outbound internet access.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - docs/infra/cloud-access-control.md
    - docs/infra/web-application-firewall.md
    - docs/infra/https-support.md
    - docs/infra/custom-domains.md
    - docs/infra/set-up-aws-account.md
    - infra/project-config/aws_services.tf
    - docs/infra/set-up-public-internet-access.md
    - infra/{{app_name}}/app-config/main.tf
    - infra/{{app_name}}/app-config/dev.tf
    - docs/decisions/infra/2022-10-05-use-custom-implementation-of-github-oidc.md
    - infra/accounts/main.tf
    - infra/project-config/networks.tf
    - docs/infra/temporary-environments-and-out-of-band-resources.md
last_documented: 2026-09-04
verified: ok
---

# Security and Access — IAM/OIDC, WAF, HTTPS, and Custom Domains

This doc covers cloud access control plus the production-launch network protections, distilled from
`docs/infra/cloud-access-control.md`, `web-application-firewall.md`, `https-support.md`,
`custom-domains.md`, and `set-up-public-internet-access.md`. These are the *preventive* controls; for
the *detective* ones (GuardDuty, malware scanning, CI vulnerability scans) see
[infra-security-monitoring](infra-security-monitoring.md). `{{app_name}}`, `<ENVIRONMENT>`, and
`<NETWORK_NAME>` are placeholders.

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
Each entry becomes a `<service>:*` allowed action, so adding or removing a service from that list
grants or revokes GitHub Actions' access to it; then apply the account layer
(`make infra-update-current-account`). See [infra-configuration](infra-configuration.md) for the
project-config model.

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
3. Set `enable_https = true` for the environment. Unlike `enable_waf`, `enable_https` and
   `domain_name` are **per-environment** variables of the `env-config` module, passed from
   `infra/{{app_name}}/app-config/<ENVIRONMENT>.tf` (they ship as `false` / `null` in `dev.tf`,
   `staging.tf`, and `prod.tf`); `docs/infra/https-support.md` just says "in your application's
   `app-config` module".
4. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>` to attach the
   certificate to the load balancer.

## Outbound public internet access

By default the ECS service sits in a private subnet with no route to the internet, reaching AWS
services through VPC endpoints. An application that calls a **non-AWS** external service (a SaaS API,
or a sibling custom API in the same repo) needs NAT gateways
(`docs/infra/set-up-public-internet-access.md`):

1. Set `has_external_non_aws_service = true` in `infra/{{app_name}}/app-config/main.tf`.
2. `make infra-update-network NETWORK_NAME=<NETWORK_NAME>` for each network the application's
   environments use (check `network_name` per environment in app-config). This creates one NAT
   gateway per availability zone in the network.
3. Exercise a code path that calls a public URL from each environment to confirm access.

For AWS-provided services you have the choice: enable public internet access, or keep traffic inside
the VPC with VPC endpoints. The flag ships as `false`; set it only when the application has a
non-AWS external dependency.

## See also

- Database access control (IAM auth, Secrets Manager) is covered in [infra-database](infra-database.md).
- Application secrets in SSM Parameter Store are covered in [infra-configuration](infra-configuration.md).
- Detective controls — GuardDuty threat detection, S3 malware scanning, and the CI image and
  Terraform scanners — are covered in [infra-security-monitoring](infra-security-monitoring.md).
  `guardduty` is one of the services in `aws_services.tf`, so CI can manage the detector.
