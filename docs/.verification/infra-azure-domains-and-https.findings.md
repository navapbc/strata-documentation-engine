# Verification Findings: infra-azure-domains-and-https

**Doc ID**: infra-azure-domains-and-https  
**Round**: 2  
**Date**: 2026-06-29

## Summary

No unsupported claims found. All major claims in the documentation are directly supported by or accurately reflect the source material:

- Custom domain configuration steps and file paths match source guidance
- ACME, Key Vault, and imported certificate options are correctly described
- Default wildcard certificate behavior is accurate
- Shared hosted zone prerequisite language matches source
- DNS delegation and verification steps align with source
- Architecture components (Application Gateway, Certificate Key Vault, ACME provider, Private DNS zones) are accurately described

## Verification Details

All claims checked:
1. ✓ Hosted zone configuration location and behavior (set-up-custom-domains.md)
2. ✓ Shared hosted zone option and typical use case (set-up-custom-domains.md)
3. ✓ DNS delegation process and tools (nslookup command, NS records)
4. ✓ A record creation for routing (set-up-custom-domains.md)
5. ✓ Certificate acquisition methods (ACME, Azure Key Vault, imported)
6. ✓ ACME defaults (Let's Encrypt staging, wildcard certificates)
7. ✓ Wildcard certificate scope and opt-out mechanism
8. ✓ Network and service layer make commands (set-up-custom-domains.md, https-support.md)
9. ✓ Architecture components and their roles (system-architecture.md)
10. ✓ Certificate Key Vault per-subscription scope
11. ✓ TLS termination at Application Gateway
12. ✓ Private DNS zones for Private Endpoint resolution

## Conclusion

The document is fully supported by the source material. No fixes required.
