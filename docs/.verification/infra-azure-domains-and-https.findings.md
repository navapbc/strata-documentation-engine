# Verification findings: infra-azure-domains-and-https (round 2)

Doc: `docs/sources/template-infra-azure/infra-domains-and-https.md`
Source: `.sources/template-infra-azure` @ `474f45e99076d3b72af4ea9d63dd5d6c0aab850f`

## Summary

All findings from round 1 have been resolved. The doc now correctly states:

1. **Automatic wildcard certificates** (line 125-134): Now accurately describes that automatic certificate behavior defaults to on only for Application Gateway networks, with explicit `manage_certs` override capability.

2. **Hosted zone derivation** (line 51-55): Now correctly specifies that only lower-environment networks (`dev`, `staging`) derive their zone from `shared_hosted_zone`, while `prod` sets its zone literally.

3. **A-record creation condition** (line 189-193): Now accurately states that A records are created only when `manage_dns` is true AND a custom domain is configured, with the full count condition included.

### Verified as fully accurate

The document's claims have been verified against source code and documentation:

- Custom domain setup sequence and `make` commands
- NS delegation with `terraform -chdir=infra/networks output -json hosted_zone_name_servers`
- Per-application domain configuration logic in `infra/{{app_name}}/app-config/env-config/domain.tf`
- ACME certificate issuance via `azuredns` DNS-01 challenge
- Certificate Key Vault naming: `substr("certs-${var.account_name}-${var.project_unique_id}", 0, 24)`
- Name transformations: `.` → `-`, `*` → `wildcard`
- `certificate_configs` assembly logic in `infra/networks/main.tf.jinja:79`
- Terraform state warning about ACME credentials
- `bin/renew-tls-certificates` targets and flags
- Application Gateway: static Standard public IP, user-assigned identity with `Key Vault Secrets User`, SKU values, DNS A record with `@` apex notation
- Container App path without gateway: `asuid.<subdomain>` TXT, CNAME to ingress FQDN, `azurerm_container_app_custom_domain`, `az containerapp hostname bind --validation-method CNAME`, skipped for temporary environments
- `use_application_gateway` as env-config output
- Shared hosted zone `DNS Zone Contributor` grant in `infra/accounts/shared_hosted_zone.tf`
- Per-subscription Certificate Key Vault architecture

## Findings

No new inaccuracies found. Document is fully supported by source code and documentation.
