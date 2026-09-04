# Verification findings: strata-sdk-cm-case-type-config

- Doc: `docs/sources/strata-sdk-case-management/strata-sdk-cm-case-type-config.md`
- Source: `.sources/strata-sdk-case-management` @ `579d27695b7f5d655d8de020c65c256db3d05951`
- Round: 2
- Verdict: all findings from round 1 have been fixed. Document is now fully supported by the source.

## Summary of round 1 fixes applied

All three findings from round 1 have been successfully addressed:

1. **validation/dag.ts** — now correctly documented as re-export-only for `validateCriterionDag` while retaining `topologicalSort` (lines 157-159).
2. **resultSchema checks** — now accurately limited to "task action that declares a `resultSchema`" (line 120), and missing source paths added to `source_ref.paths`: `sdk/config-schema/src/structural/result-schema.ts` and `sdk/case-management-blueprints/src/blueprint.ts`.
3. **Evaluator/guard checks** — now clarifies that these checks report all missing ids in one error (lines 83-84).

## Verification complete

All major claims verified as accurate against source:
- CaseTypeConfig shape and field list — `sdk/types/src/workflow.ts:58-66`
- HumanIdConfig defaults (separator: "-", startNumber: 1, padding: 3) — `sdk/types/src/workflow.ts:46-55`
- Eight ordered registration checks — `sdk/core/src/config/configuration-registry.ts:37-111`
- current() semantics (latest by effectiveDate, else insertion order) — `configuration-registry.ts:143-170`
- validateConfig behavior (warn-only schemaVersion, immediate Zod return, accumulate structural checks, collect hooks with "from->to" format) — `sdk/config-schema/src/validate-config.ts:171-201`, `134-163`
- Issue codes (SCHEMA, SCHEMA_VERSION, STATUS_PROGRESSION_EMPTY, STATUS_PROGRESSION_INITIAL, GUARD_UNKNOWN_CRITERION, GUARD_INVALID_STATUS, RESULT_SCHEMA_INVALID, CONFIGURATION_ERROR) — confirmed via grep
- SCHEMA_VERSION = '0.1.0' — `sdk/config-schema/src/version.ts:10`
- Zod schema details (z.coerce.date() on effectiveDate, z.record() on resultSchema) — `sdk/config-schema/src/schema.ts:63, 98`
- Structural validators relocated to config-schema with core re-exports — `sdk/core/src/validation/workflow.ts:9`, `sdk/core/src/validation/dag.ts:12`
- schemaVersion stamped on blueprints — `sdk/case-management-blueprints/src/blueprint.ts:19`
- Type-drift test — `sdk/config-schema/src/__tests__/schema-drift.test.ts`

No new findings.
