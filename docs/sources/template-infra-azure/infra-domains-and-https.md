---
id: infra-azure-domains-and-https
title: Custom domains and HTTPS for the Azure infra template
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, dns, domains, https, tls, certificates, key-vault]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service]
summary: How to configure custom domains (Azure DNS hosted zones and A records) and HTTPS/TLS certificates (ACME, Key Vault, or imported) for application services in the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: f930f2ba39be8ab6a55eaa0b538ad96def2e331b
  paths:
    - docs/infra/set-up-custom-domains.md
    - docs/infra/https-support.md
    - docs/system-architecture.md
verified: ok
last_documented: 2026-06-29
---

# Custom domains and HTTPS

This guide covers giving your application a hostname (custom domains via Azure DNS) and securing it
with TLS (HTTPS). Both are configured through the **network** and **service** layers, following the
documented dependency chain: [set up the Azure account](infra-azure-set-up-account-and-network.md) →
set up custom domains → set up HTTPS.

## Custom domains

The custom-domain setup creates an Azure DNS hosted zone to manage DNS records for a domain and its
subdomains, and A (address) records routing traffic from a custom domain to the application's load
balancer. **Prerequisite:** the [Azure account](infra-azure-set-up-account-and-network.md) is set up.
(Source: `docs/infra/set-up-custom-domains.md`.)

1. **Set the hosted zone.** Update `hosted_zone` in the `domain_config` object in the network section
   of `infra/project-config/networks.tf`. A hosted zone covers the domain and all subdomains — e.g.
   `platform-test-azure.navateam.com` covers `cdn.platform-test-azure.navateam.com`,
   `notifications.platform-test-azure.navateam.com`, etc.
   - **Shared hosted zone option:** if your network admin can delegate an entire subdomain to your
     project (typically for lower environments only), set `shared_hosted_zone` in
     `infra/project-config/networks.tf`. The infrastructure then creates a single DNS hosted zone in
     the shared account that all environments using that domain insert records into.
2. **Create the hosted zone** by applying the network layer:
   `make infra-update-network NETWORK_NAME=<NETWORK_NAME>`.
3. **Delegate DNS to the new hosted zone.** At your domain registrar (Namecheap, GoDaddy, etc.), add
   an NS record whose name is the `hosted_zone` and whose value is the hosted zone's name servers.
   List them with `terraform -chdir=infra/networks output -json hosted_zone_name_servers`, then
   verify delegation with `nslookup -type=NS <HOSTED_ZONE>`.
4. **Configure the per-application domain.** Set `domain_name` for each application environment in the
   `app-config` module. It must equal the `hosted_zone`, be a subdomain of it, or be a domain-safe
   string treated as a subdomain (e.g. for hosted zone `platform-test-azure.navateam.com`, both
   `cdn.platform-test-azure.navateam.com` and `cdn` are valid and equivalent).
5. **Create the A records** routing the custom domain to the load balancer:
   `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.
6. **Repeat** steps 4–5 for each application sharing the network.

**Externally managed DNS:** to manage records outside the project, set
`network_configs[*].domain_config.manage_dns = false` in the networks section of the project-config
module. (Source: `docs/infra/set-up-custom-domains.md`.)

## HTTPS / TLS support

HTTPS is required for all public web services. **Prerequisite:** custom domains must be set up first,
since certificates are tied to a specific domain. (Source: `docs/infra/https-support.md`.)

Certificates can be obtained three ways:

- **ACME (default):** acquired via the ACME protocol; the server is configurable and defaults to
  **Let's Encrypt staging**. By default the system attempts a **wildcard** certificate for subdomains
  of the network's hosted zone, supporting the default pattern where each application/service (and
  its temporary/PR environments) gets a subdomain. Opt out by setting `manage_certs = false` in the
  network's `domain_config` block, after which the system does only what you configure in the
  certificate configuration object.
- **Azure Key Vault:** via a DigiCert or GlobalSign account.
- **Imported:** generate a certificate externally and upload it to the project's Certificate Key
  Vault, then set `cert_name` in the `env-config` of each service that should use it.

Steps:

1. **Set desired certificates** in the network's domain configuration. For each custom domain, define
   a certificate configuration object with `source` set to `issued` (you typically want at least one
   per application/service). For an existing certificate, import it into the project's Certificate Key
   Vault and set `cert_name` in the relevant services' `env-config`.
2. **Issue the certificates** by applying the network layer:
   `make infra-update-network NETWORK_NAME=<NETWORK_NAME>`.
3. **Attach the certificate to the load balancer** by applying the service layer:
   `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

## How this fits the architecture

The Application Gateway (one per application/service) terminates TLS at the load balancer; the
project's per-subscription **Certificate Key Vault** holds the TLS certificates, and the Terraform
**ACME provider** acquires and refreshes certificates during Terraform operations for domains not
managed by other methods. Private DNS zones provide name resolution for Private Endpoints inside the
virtual network. (Source: `docs/system-architecture.md`.)
</content>
</invoke>
