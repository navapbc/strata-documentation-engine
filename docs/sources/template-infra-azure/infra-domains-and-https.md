---
id: infra-azure-domains-and-https
title: Custom domains and HTTPS for the Azure infra template
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, dns, domains, https, tls, certificates, key-vault, application-gateway]
related: [infra-azure-overview, infra-azure-set-up-account-and-network, infra-azure-set-up-database-and-service, infra-azure-access-control-and-operations]
summary: How to configure custom domains (Azure DNS hosted zones, shared zones, and records) and HTTPS/TLS certificates (ACME, Key Vault, or imported) for application services in the Azure infra template, and how they are renewed.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - docs/infra/set-up-custom-domains.md
    - docs/infra/https-support.md
    - docs/system-architecture.md
    - infra/project-config/networks.tf
    - infra/networks/main.tf.jinja
    - infra/networks/outputs.tf
    - infra/{{app_name}}/app-config/env-config/domain.tf
    - infra/{{app_name}}/app-config/env-config/variables.tf
    - infra/{{app_name}}/service/domain.tf
    - infra/modules/domain/resources/certificates.tf
    - infra/modules/certificate-store/interface/main.tf
    - infra/modules/service/dns.tf
    - infra/modules/service/application_gateway.tf
    - bin/renew-tls-certificates
last_documented: 2026-09-04
verified: ok
---

# Custom domains and HTTPS

This guide covers giving your application a hostname (custom domains via Azure DNS) and securing it
with TLS. Both are configured through the **network** and **service** layers, in the dependency order
the shipped docs describe: [set up the Azure account](infra-azure-set-up-account-and-network.md) →
set up custom domains → set up HTTPS → set up the network.

## Custom domains

You need a hostname at which to host your project's web apps. The custom-domain setup process
(`docs/infra/set-up-custom-domains.md`):

1. creates a hosted zone in Azure DNS to manage DNS records for a domain and its subdomains,
2. creates DNS A (address) records routing traffic from a custom domain to the application's load
   balancer.

**Prerequisite:** the [Azure account](infra-azure-set-up-account-and-network.md) is set up.

1. **Set the hosted zone.** Update `hosted_zone` in the `domain_config` object in the network section
   of `infra/project-config/networks.tf`. A hosted zone represents a domain and all of its
   subdomains — a hosted zone of `platform-test-azure.navateam.com` covers
   `cdn.platform-test-azure.navateam.com`, `notifications.platform-test-azure.navateam.com`,
   `foo.bar.platform-test-azure.navateam.com`, and so on. In the shipped defaults the
   lower-environment networks (`dev`, `staging`) derive their hosted zone from
   `shared_hosted_zone` (for example `dev.${shared_hosted_zone}`), while the `prod` network sets its
   zone literally (`my-project-subdomain.foo.com`).
2. **Or use a shared hosted zone.** If your network administrator can delegate an entire subdomain to
   your project — likely just for lower environments — set `shared_hosted_zone` in
   `infra/project-config/networks.tf` to that domain. The infrastructure then creates a single DNS
   hosted zone in the **shared** account, and every environment configured to use that domain inserts
   its records into it. The account layer owns that zone in the shared subscription and grants other
   subscriptions' GitHub Actions principals `DNS Zone Contributor` on it.
3. **Create the hosted zone** by applying the network layer:

   ```bash
   make infra-update-network NETWORK_NAME=<NETWORK_NAME>
   ```

4. **Delegate DNS to the new hosted zone.** You most likely registered the domain outside this
   project, so at your registrar (Namecheap, GoDaddy, and so on) add a DNS **NS** (nameserver) record
   whose name is the `hosted_zone` and whose value is the list of the zone's name servers. List them
   with:

   ```bash
   terraform -chdir=infra/networks output -json hosted_zone_name_servers
   ```

   The values include trailing periods (`"ns1-04.azure-dns.com."`). Verify the delegation took with:

   ```bash
   nslookup -type=NS <HOSTED_ZONE>
   ```

5. **Configure the per-application domain.** Define `domain_name` for each application environment in
   the `app-config` module. It must be the same as the `hosted_zone`, a subdomain of it, or a
   domain-safe string that will be treated as a subdomain of the network hosted zone. For hosted zone
   `platform-test-azure.navateam.com`, all of `platform-test-azure.navateam.com`,
   `cdn.platform-test-azure.navateam.com`, and `cdn` are valid — the latter two being equivalent. The
   logic lives in `infra/{{app_name}}/app-config/env-config/domain.tf`: a `domain_name` containing a
   `.` is treated as a fully qualified name, anything else is suffixed with the network's hosted zone
   and marked `is_subdomain_of_network`. The shipped `dev.tf` and `staging.tf` pass the bare
   `app_name`; `prod.tf` passes a fully qualified domain.
6. **Create the A records** routing the custom domain to the application's load balancer, by applying
   the service layer:

   ```bash
   make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
   ```

7. **Repeat** steps 5 and 6 for each application sharing the network.

**Externally managed DNS.** To manage records outside the project, set
`network_configs[*].domain_config.manage_dns = false` in the networks section of the project-config
module. With `manage_dns = false` the domain module issues no certificates of its own and the service
module creates no DNS records (`infra/modules/domain/resources/certificates.tf`,
`infra/modules/service/dns.tf`).

## HTTPS / TLS support

HTTPS is required for all public web services. **Prerequisite:** custom domains must be set up first,
because TLS certificates must be configured for the specific domain. (Source:
`docs/infra/https-support.md`.)

Certificates can come from three places:

- **ACME (the default).** Acquired via the ACME protocol. The server is configurable and defaults to
  **Let's Encrypt staging** — set `acme_server_url` in the network's `domain_config` to switch (the
  shipped `prod` network uses `https://acme-v02.api.letsencrypt.org/directory`). The comment in
  `infra/project-config/networks.tf` warns that switching later requires tearing down the service
  layer and destroying the existing certificate resources first.
- **Azure Key Vault**, via a DigiCert or GlobalSign account.
- **Generated externally and uploaded** to Azure Key Vault for the system to use.

### Steps

1. **Set the desired certificates in the domain configuration.** When a network uses an Application
   Gateway, the system by default attempts to acquire a **wildcard** certificate for subdomains of
   the network hosted zone, which supports the default setup where each application or service has a
   subdomain on its network (including temporary/PR environments). That default is conditional:
   `infra/networks/main.tf.jinja` computes the certificate configs as
   `try(local.domain_config.manage_certs, local.use_application_gateway)`, so automatic certificates
   are on by default only for Application Gateway networks. Setting `manage_certs` in the relevant
   network's `domain_config` overrides that default in either direction — `false` turns the automatic
   behavior off (the system then does nothing beyond what you put in the certificate configuration
   object), `true` turns it on for a network that does not use an Application Gateway.

   For each custom domain you want in the network, define a certificate configuration object with
   `source` set to `issued`. You will probably want at least one custom domain per
   application/service, and it must be the hosted zone itself or a subdomain of it. To use an
   existing certificate, import it into the project's Certificate Key Vault and set `cert_name` in
   the `env-config` of every service that should use it (`cert_name` is an `env-config` variable
   documented as "Name of Key Vault entry containing certificate to use for configured domain").

2. **Issue the certificates** by applying the network layer:

   ```bash
   make infra-update-network NETWORK_NAME=<NETWORK_NAME>
   ```

3. **Attach the certificate to the load balancer** by applying the service layer:

   ```bash
   make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
   ```

### How certificates are actually issued

`infra/modules/domain/resources/certificates.tf` splits `certificate_configs` by `source`:
`issued` entries (managed by the project, and only when `manage_dns` is true) are acquired with the
Terraform ACME provider using an `azuredns` DNS-01 challenge against the zone's resource group,
subscription, and name; `imported` entries are ones created outside the project. Issued certificates
are then written into the certificate Key Vault as `azurerm_key_vault_certificate` resources whose
names replace `.` with `-` and `*` with `wildcard` — so a wildcard cert for
`*.dev.example.com` is stored as `wildcard-dev-example-com`.

The network root module assembles `certificate_configs` itself: it derives an `issued` entry for
every non-subdomain application domain in the network plus one `*.<hosted_zone>` wildcard when any
application domain is a subdomain of the network zone, and merges those with any manually configured
`certificate_configs` (`infra/networks/main.tf.jinja`).

> **The ACME account key and certificate material are stored in the Terraform state.** The module
> says so explicitly and suggests acquiring and renewing certificates out of band if that is
> unacceptable for your project.

### Renewing certificates

`bin/renew-tls-certificates <network_name>` re-runs the network layer targeted only at the ACME
registration, the ACME certificates, and the Key Vault certificate resources, with
`-auto-approve -input=false` — the narrow operation suitable for a scheduled renewal.

## How this fits the architecture

Two ingress paths exist, chosen by whether the network defines an
`application_gateway_subnet_name` (surfaced as the `use_application_gateway` output of `env-config`):

- **With an Application Gateway** (the default, one per application/service) — the gateway is the
  load balancer where the TLS certificate is attached, it gets its own static public IP and a managed
  identity that reads the certificate from the Certificate Key Vault, and its SKU comes from
  `service_application_gateway_sku_name` (`Basic`, `Standard_v2`, or `WAF_v2`). This is the path that
  creates the DNS **A record**: `azurerm_dns_a_record.service` in
  `infra/modules/service/application_gateway.tf` points the service's subdomain (or `@` for the zone
  apex) at the gateway's public IP, and is created only when `manage_dns` is true and a custom
  domain is configured (its count is `var.manage_dns && local.custom_fqdn != null &&
  local.use_application_gateway`).
- **Without one** (the alternative, non-production setup) — the service module instead binds a custom
  domain directly onto the Container App: it writes an `asuid.<subdomain>` TXT record carrying the
  app's `custom_domain_verification_id`, a CNAME to the Container App ingress FQDN, and an
  `azurerm_container_app_custom_domain`, then finishes the managed-certificate binding through a
  `local-exec` call to `az containerapp hostname bind ... --validation-method CNAME` (a documented
  workaround for a Terraform provider gap). None of these are created for temporary workspaces.
  (Source: `infra/modules/service/dns.tf`.)

Supporting pieces from `docs/system-architecture.md`: the per-subscription **Certificate Key Vault**
holds TLS certificates for all web services in that subscription; the **Terraform ACME provider**
acquires and refreshes certificates during Terraform operations for domains without certificates
managed another way; and **Private DNS zones** provide name resolution for the Private Endpoints
inside the virtual network. The certificate vault name is derived as
`certs-<account_name>-<project_unique_id>` truncated to 24 characters
(`infra/modules/certificate-store/interface/main.tf`).

The service's public URL is emitted as the `service_endpoint` output — the custom FQDN when one is
configured, otherwise the Container App ingress FQDN.
