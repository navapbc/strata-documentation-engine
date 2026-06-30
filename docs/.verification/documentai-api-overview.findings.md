# Verification findings: documentai-api-overview (round 1)

Doc: `docs/sources/documentai-api/overview.md`
Source: `.sources/documentai-api`

## Finding 1 — Low

**Claim:** "the `bda_result_processor` job to parse the output and update a DynamoDB table"

**Issue:** The architecture diagram (`template/docs/{{app_name}}/diagrams/architecture.mmd`) labels this same processing node as `bda-output-processor` / "BDA Output Processor", while `README.md.jinja` step 6 of the processing flow also calls it `bda_output_processor`. The doc uses `bda_result_processor`, which matches the actual job directory (`src/documentai_api/jobs/bda_result_processor/`) and the pyproject.toml entrypoint (`bda_result_processor = "documentai_api.jobs.bda_result_processor.main:app"`), but conflicts with the diagram label and the flow description in the app README.

**Severity:** low

**Evidence:**
- `template/docs/{{app_name}}/diagrams/architecture.mmd` line 13: `service bda-output-processor(logos:aws-step-functions)[BDA Output Processor]`
- `template/{{app_name}}/README.md.jinja` line 26: `` S3 event triggers `bda_output_processor` job ``
- `template/{{app_name}}/pyproject.toml` line 41: `bda_result_processor = "documentai_api.jobs.bda_result_processor.main:app"` (authoritative entrypoint name)

**Suggested fix:** Acknowledge the dual naming: the job's installed entrypoint and source directory is `bda_result_processor`, but the architecture diagram and README processing flow label it `bda_output_processor`. The doc is using the correct code-level name. Consider adding a parenthetical noting the alternative label to avoid confusion: "the `bda_result_processor` job (labeled 'BDA Output Processor' in the architecture diagram)".

---

## Summary

The doc is largely accurate and well-supported by the source. The single finding is low-severity: the doc uses the authoritative code-level job name (`bda_result_processor`) while the architecture diagram and the app README's processing flow use a different label (`bda_output_processor` / "BDA Output Processor") for the same entity. All other claims — document categories, supported file formats, ECS + ALB architecture, S3-triggered processing flow, DynamoDB tracking, BDA integration, copier-based distribution, `nava-platform` CLI installation, and infra template integration — are fully supported by the source.
