# Verification findings: app-template-setting-up-a-new-rails-project

Doc: `docs/sources/app-template/setting-up-a-new-rails-project.md`
Source checkout: `.sources/app-template`
Round: 3

## Summary

Document is fully verified and accurate. Round 2 finding has been resolved. All major
claims and cross-references are supported by the source repository at ref
`29a54e3206e36018997b54b74bdd2349ddfad984`.

## Findings

No unsupported claims found.

## Verification completed (Round 3)

Re-verified all major claims from prior rounds:

- Section 1: nava-platform CLI installation requirement and command syntax ✓
- Section 2: Directory structure (adapters, controllers, forms, mailers, models, services, views) ✓
- Section 2: Dockerfile multi-stage build (base → build → dev / release) ✓
- Section 3: `.env` generation via `make .env` from `local.env.example` ✓
- Section 3: Default environment values (AUTH_ADAPTER="mock", DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) ✓
- Section 4: `init-container` and `init-db` target chains in Makefile ✓
- Section 4: `init-native` requirements (Ruby version from .ruby-version, Node LTS) ✓
- Section 5: Route configuration (root, /users/..., /up, /dev/sandbox) ✓
- Section 5: Mock auth adapter behavior with reserved keyword qualifiers (unconfirmed, mfa, wrong) ✓
- Section 5: Form sandbox with USWDS form helpers reference ✓
- Section 6: CI workflow (lint and test commands) ✓
- Section 7: UUID primary key requirement and Rails generator syntax ✓
- Section 7: Makefile targets (locale, new-authz-policy, rails-generate) ✓
- Cross-references: auth.md, forms.md, software-architecture.md, technical-foundation.md all exist ✓
- Deployment reference to template-infra (template-only-docs/Deployment.md) ✓

Previous Round 2 finding: Fixed. Mock auth claim now includes proper qualifier about
reserved keywords.
