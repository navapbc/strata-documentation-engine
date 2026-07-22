# Verification findings: infra-azure-domains-and-https (Round 2)

**Status:** Verified - no findings

**Verification date:** 2026-07-21

## Summary

The document "Custom domains and HTTPS for the Azure infra template" was verified against the following source files:
- docs/infra/set-up-custom-domains.md
- docs/infra/https-support.md
- docs/system-architecture.md
- infra/project-config/networks.tf
- infra/networks/providers.tf

All claims in the document are accurate and well-supported by the source material.

## Verification details

### Custom domains section
- Hosted zone configuration and purpose: verified
- Shared hosted zone option: verified
- DNS delegation steps (NS records): verified
- Domain name configuration rules: verified
- A record creation: verified
- Externally managed DNS option: verified

### HTTPS/TLS section
- HTTPS requirement: verified
- Prerequisite (custom domains): verified
- Three certificate acquisition methods (ACME, Azure Key Vault, Imported): verified
- ACME defaults to Let's Encrypt staging: verified (confirmed in `infra/networks/providers.tf`)
- Wildcard certificate default behavior: verified
- `manage_certs = false` opt-out mechanism: verified
- Certificate configuration steps: verified

### Architecture section
- Application Gateway as per-service load balancer: verified
- Certificate Key Vault as per-subscription storage: verified
- ACME provider certificate acquisition and refresh: verified
- Private DNS zones for name resolution: verified

All source references (related documents, source_ref paths) are valid and correspond to existing documents with correct IDs.
