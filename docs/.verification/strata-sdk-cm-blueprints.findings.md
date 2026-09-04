# Verification: strata-sdk-cm-blueprints

**Round 2 — adversarial verification against source**

Date: 2026-09-04
Source ref: 579d27695b7f5d655d8de020c65c256db3d05951

## Claims Verified

- **Package structure**: Decision-criteria and program-types catalogs exist as documented.
- **Decision-criteria count**: Confirmed 14 shapes in the catalog (index.ts lines 41-56).
- **Criterion table (lines 87-102)**: All 14 entries verified against actual ruleEvaluatorId values in source files.
- **PFML criteria**: Confirmed 10 criteria (index.ts lines 30-44):
  - identity-verified, residency-verified, wage-eligibility, qualifying-leave-reason, medical-certification, employer-verification, leave-duration, submission-timeliness, benefit-coordination, covered-employment.
- **SNAP criteria**: Confirmed 6 criteria (index.ts lines 26-32):
  - identity-verified, residency-verified, household-composition, income-eligibility, resource-limit, work-requirement.
- **PFML workflow**: "submitted → in-review → approved | denied | withdrawn" with "information-requested" detour (workflow.ts lines 6-36).
- **PFML tasks**: Three tasks confirmed:
  - staff-review, information-request-followup, medical-certification-review (tasks.ts lines 4-39).
- **SNAP workflow**: "submitted → interview-scheduled → in-review" with "deny-failure-to-appear" path (workflow.ts lines 7-48).
- **SNAP tasks**: Three tasks confirmed:
  - eligibility-interview, staff-review, information-request-followup (tasks.ts lines 4-35).
- **Guards**: Both PFML and SNAP gate in-review→approved transitions on `{ type: 'all-criteria-resolved' }` AND `{ type: 'custom', guardId: 'supervisor-sign-off' }` (PFML workflow.ts lines 29-32; SNAP workflow.ts lines 41-44).
- **Shared criteria**: PFML and SNAP intentionally share exactly two criteria: identity-verified and residency-verified (confirmed in source and asserted by test at blueprints.test.ts line 38).
- **Blueprint schema version**: BLUEPRINT_SCHEMA_VERSION = '0.1.0' (blueprint.ts line 9); mirrors SCHEMA_VERSION per test (blueprints.test.ts lines 13-14).
- **ProgramTypeBlueprint type**: Correct definition at blueprint.ts lines 19, with schemaVersion as documented (lines 74-76 of doc).
- **Dependencies**: package.json confirms only `@nava-strata/case-management-types` in dependencies (no runtime engine).
- **Income-eligibility gotcha**: Confirmed `snap-income-eligibility-check` ruleEvaluatorId and `dependsOn: ['household-composition']` (income-eligibility.ts lines 34, 40).
- **Catalog is not a config**: Confirmed decisionCriteriaCatalog is a flat array with no workflow (index.ts lines 41-56).
- **structuredClone note**: General JS fact, no contradictions in source.
- **No blueprint task resultSchema**: Confirmed; no task definitions in pfmlTasks or snapTasks carry a resultSchema property.
- **Jurisdiction specifics**: README explicitly states Virginia/Minnesota belong to host implementations, not this package (README.md lines 25-27).
- **Package positioning**: README confirms package lives under sdk/ because it depends on SDK family, but is not an SDK package itself — depends only on case-management-types, not runtime engine (README.md lines 35-37).
- **Example code**: Example identityVerifiedCriterion at doc lines 109-120 matches source exactly (identity-verified.ts lines 28-38).

## Findings

None. The document is fully supported by the source code.
