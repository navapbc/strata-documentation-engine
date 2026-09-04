# Verification findings: documentai-api-using-the-template (round 2)

Doc: `docs/sources/documentai-api/using-the-template.md`
Source: `.sources/documentai-api` @ `753ad50eba97fa5a3489370b7b5d3831c4e0105f` (matches `source_ref.ref`)

## Summary

All round 1 findings have been addressed in this revision:

1. **Issue #1 (Local port story)** — FIXED. Lines 149-153 now explain that `local.env.example` seeds `HOST=localhost` and `PORT={{app_local_port}}`, and explicitly state that for Docker paths to set `HOST=0.0.0.0` and `PORT=8000` in `.env`, with seeded values for native development.

2. **Issue #2 (make start-local --frozen)** — FIXED. Line 146 now correctly shows `make start-local # uv run --frozen documentai_api` with the `--frozen` flag.

3. **Issue #3 (make help statement)** — FIXED. Lines 158-159 now properly state "`make help` lists the documented targets; `architecture-diagram` carries no `##` comment, so it never shows up there."

## Verification against source

Comprehensive re-verification confirms the doc remains accurate across all major sections:

- **Installation/update commands** (lines 54, 63): Match README.md templates exactly
- **copier.yml variables** (lines 68-74): Two variables, correct types, defaults, constraints
- **Template scaffold structure** (lines 91-102): Accurate tree with correct paths
- **CI workflow** (lines 97-100): Correct job names and targets
- **Application stack** (lines 106-114): Correct Python version (3.12), base image (python3.14), dependencies, and mypy strict mode
- **Entry points table** (lines 116-125): All four scripts with correct targets verified
- **Makefile targets** (lines 154-159): All referenced targets exist; architecture-diagram undocumented status confirmed
- **Environment variables** (lines 167-180): AWSEnvConfig and AppEnvConfig requirements/defaults all correct
- **Authentication** (lines 187-198): API-Key header, 401/500 responses, public routes, SSM path all verified
- **API endpoints** (lines 269-286): POST /v1/documents, GET /v1/documents/{job_id}, GET /v1/schemas, GET /v1/schemas/{document_type}, plus public endpoints all correct
- **Polling behavior** (lines 273-280): `timeout=180` default vs. "120" docstring discrepancy correctly documented; `is_completed` gap for `blurry_document_detected` and `password_protected` confirmed
- **Response serialization** (line 288): `to_camel` alias generator confirmed in models/base.py
- **File size limits** (lines 293-301): TIFF handling correctly described as 500 MiB, not 5 MiB
- **5-page truncation** (line 298): Confirmed in invoke_bedrock_data_automation
- **Deployment steps** (lines 206-225): All steps and gotchas verified against deployment.md
- **Issue references** (lines 231-232): #52 and #53 correctly linked to TODOs in deployment.md Terraform

## Conclusion

No new issues detected. Doc is well-grounded and suitable for publication.
