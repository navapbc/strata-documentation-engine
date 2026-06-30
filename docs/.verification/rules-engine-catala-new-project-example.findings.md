# Verification findings: rules-engine-catala-new-project-example (round 2)

Doc: `docs/sources/strata-template-rules-engine-catala/new-project-example.md`
Source: `.sources/strata-template-rules-engine-catala` @ 60d6db4a50d50efc31b93f9aa2572bab77bb8cec

## Summary

All findings from round 1 have been successfully addressed. The doc is now fully accurate and
well-supported by the source material.

## Status: VERIFIED (no findings)

The document's substantive content is fully grounded:
- Installation command and copier variables match README.md and copier.yml
- Project structure is correctly derived from template file listing with proper attribution
- LeaveBalance Catala scope definitions (inputs, outputs, entitlements, logic) match paidleave.catala_en
- FastAPI router endpoints, leave-type mapping, error handling all verified in paidleave.py
- Curl sample response and all test coverage (sufficient balance, overall cap, invalid type, disabled module) verified in test_api.py
- Makefile commands (make catala-build, make test-all) verified in Makefile.jinja

## Round 1 findings — all fixed

### 1. main.py annotation — FIXED
- Changed from "uvicorn entrypoint (start-server)" to "uvicorn entrypoint (started via `make start` / `docker compose`, or by running src/main.py directly)"

### 2. docs/ in rendered tree — FIXED
- Removed docs/ directory from the rendered tree and added explicit note that those docs come from the base platform template and are not part of this repo

### 3. Tree attribution — FIXED
- Changed from claiming tree is "from README.md.jinja" to properly stating it is "derived from the `template/{{app_name}}/` file listing (annotations from the README's directory structure block in `template/{{app_name}}/README.md.jinja`)"

### 4. src/generated/ description — FIXED
- Enhanced to: "ships pre-populated with the Catala runtime and compiled Paidleave.py; `make catala-build` regenerates it"

### 5. app_local_port prompt text — FIXED
- Now quotes the actual help text: "The port to be used in local development of '{{ app_name }}'" with (default `3001`) noted separately

## Comprehensively verified

- Install command / `nava-platform app install` (README.md "Installation")
- `app_name` validator regex `^[a-z0-9\-_]+$` (copier.yml)
- copier.yml variables and defaults (app_name, app_local_port=3001)
- All files in rendered project tree (catala/, src/, tests/, config files)
- LeaveBalance scope: all outputs (max_entitlement, leave_balance, total_requested, has_sufficient_leave_balance)
- Leave type entitlements: Medical 20, Bonding 12, Care for Family 12, Care for Family Service Member 26
- has_sufficient_leave_balance logic: type balance AND 26-week overall cap
- FMLA citations: 29 U.S.C. § 2612 and 29 CFR Part 825
- Endpoint: `/demo/leave-balance` under `/demo` prefix
- Leave type JSON mapping: medical_leave, bonding_leave, care_for_family, care_for_family_service_member
- HTTP 400 on invalid leave type
- Curl sample response: max_entitlement=20, leave_balance=20, total_requested=4, has_sufficient_leave_balance=true
- All test cases: test_sufficient_balance_medical_leave, overall-cap rejection, invalid type, disabled module
- `make catala-build` and `make test-all` commands
