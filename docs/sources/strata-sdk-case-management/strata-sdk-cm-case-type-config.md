---
id: strata-sdk-cm-case-type-config
title: Case type configuration and validation
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, configuration, validation, zod, schema-version]
related:
  - strata-sdk-cm-getting-started
  - strata-sdk-cm-workflow
  - strata-sdk-cm-evidence-signals-criteria
  - strata-sdk-cm-tasks
  - strata-sdk-cm-blueprints
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The CaseTypeConfig shape, the immutable versioned configuration registry, and the two validation paths (runtime register versus standalone validateConfig).
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/workflow.ts
    - sdk/types/src/entities.ts
    - sdk/core/src/config/configuration-registry.ts
    - sdk/core/src/operations/config-operations.ts
    - sdk/config-schema/src/index.ts
    - sdk/config-schema/src/schema.ts
    - sdk/config-schema/src/validate-config.ts
    - sdk/config-schema/src/version.ts
    - sdk/config-schema/src/structural/dag.ts
    - sdk/config-schema/src/structural/workflow.ts
    - sdk/config-schema/src/structural/result-schema.ts
    - sdk/case-management-blueprints/src/blueprint.ts
    - sdk/config-schema/scripts/generate-json-schema.ts
    - docs/proposals/program-workflow-generator.md
last_documented: 2026-09-04
verified: ok
---

# Case type configuration and validation

A program in this SDK **is** a `CaseTypeConfig`. Everything the runtime does for a case —
which decisions get made, which lifecycle states exist, which staff work items appear — comes
from a registered config plus the evaluator/guard functions its string ids point at.

## The `CaseTypeConfig` shape

From `sdk/types/src/workflow.ts`:

```ts
interface CaseTypeConfig {
  id: string;                        // e.g., "qc-review"
  version: string;                   // e.g., "fy2026-q3"
  workflow: WorkflowDefinition;
  criteria: CriterionDefinition[];
  taskDefinitions?: TaskDefinition[];
  humanIdConfig?: HumanIdConfig;
  effectiveDate?: Date;
}
```

- `workflow` — the state machine; see [Workflow, transitions, and guards](./strata-sdk-cm-workflow.md).
- `criteria` — the decision DAG; see [Evidence, signals, and criteria](./strata-sdk-cm-evidence-signals-criteria.md).
- `taskDefinitions` — staff work items; see [Tasks](./strata-sdk-cm-tasks.md).
- `humanIdConfig` — `{ prefix?, separator?, startNumber?, padding? }`; defaults are separator
  `-`, `startNumber` 1, `padding` 3.
- `effectiveDate` — used by `current()` to decide which registered version is latest.

`CaseTypeConfig` carries **no `schemaVersion` field**. `schemaVersion` is stamped on generated
and blueprint configs as an extra property and read by the validator only (see below).

## Registering a config at runtime

`sdk.config` (`ConfigOperationsImpl`) is a thin pass-through to `ConfigurationRegistryImpl`:

```ts
sdk.config.register(config);                        // validates, then stores
sdk.config.resolve('qc-review', 'fy2026-q3');       // exact version
sdk.config.current('qc-review');                    // latest effective version
```

`register` in `sdk/core/src/config/configuration-registry.ts` performs these checks in order,
throwing `ConfigurationError` on the **first** failing check (the evaluator and guard checks each
report all missing ids in one error):

1. **Duplicate version** — `(id, version)` already registered. Versions are immutable.
2. **Criterion DAG** — `validateCriterionDag`: every `dependsOn` id exists, no cycles.
3. **Workflow reachability** — `validateWorkflowGraph`: no state unreachable from `initialStatus`.
4. **Auto-transition cycles** — `validateNoAutoTransitionCycles`.
5. **`statusProgression`** — non-empty, and contains the criterion's `initialStatus`.
6. **Evaluator references** — every `ruleEvaluatorId` is a key of `options.evaluators`.
7. **Guard references** — every `{ type: 'custom', guardId }` is a key of `options.guards`.
8. **Criterion-status guards** — the referenced criterion exists and every `requiredStatus`
   value is in that criterion's `statusProgression`.

`current(caseTypeId)` returns the config with the **latest `effectiveDate`** when any registered
version has one; otherwise the **most recently registered** version (insertion order).

## Standalone validation: `@nava-strata/config-schema`

The registry needs live evaluator and guard registries and fails fast. Tooling (the generator
skill, the `tools/workflow-viewer` app) needs the opposite: validate a JSON config with no
runtime, collect *every* problem, and report the code a host still has to write. That is
`validateConfig`:

```ts
import { validateConfig } from '@nava-strata/config-schema';

const report = validateConfig(JSON.parse(rawJson));
// report: { valid, errors, warnings, unimplementedHooks, config? }
```

`validateConfig` (`sdk/config-schema/src/validate-config.ts`):

1. Warns (never errors) on a `schemaVersion` mismatch via `checkSchemaVersion`.
2. Parses with the Zod `caseTypeConfigSchema`. **If Zod fails it returns immediately** with
   `code: 'SCHEMA'` issues and an empty `unimplementedHooks` list.
3. Otherwise runs the structural checks, accumulating all issues: criterion DAG, workflow
   reachability, auto-transition cycles, `statusProgression`, criterion-status guards, and
   `resultSchema` shape for every task action that declares a `resultSchema`
   (`RESULT_SCHEMA_INVALID`).
4. Collects `unimplementedHooks`: one entry per distinct `ruleEvaluatorId` (`kind: 'evaluator'`)
   and per distinct custom `guardId` (`kind: 'guard'`), each with `referencedBy` — the criterion
   id, or `"from->to"` for a guard.

Issue codes emitted: `SCHEMA`, `SCHEMA_VERSION` (warning), `STATUS_PROGRESSION_EMPTY`,
`STATUS_PROGRESSION_INITIAL`, `GUARD_UNKNOWN_CRITERION`, `GUARD_INVALID_STATUS`,
`RESULT_SCHEMA_INVALID`, plus `CONFIGURATION_ERROR` for the relocated structural validators.

### Schema versioning

`SCHEMA_VERSION` is `'0.1.0'` (`sdk/config-schema/src/version.ts`). `checkSchemaVersion`
returns a warning string when a config's `schemaVersion` differs *or is absent*, and `null`
only on an exact match. So a config with no `schemaVersion` always produces a
`SCHEMA_VERSION` warning.

### Where the schema lives

The Zod schemas in `sdk/config-schema/src/schema.ts` are **hand-authored mirrors** of the
interfaces in `@nava-strata/case-management-types`, because the types package must stay
runtime-dependency-free. A type-level drift test
(`sdk/config-schema/src/__tests__/schema-drift.test.ts`) keeps the two in sync. A JSON Schema
snapshot is generated from Zod:

```bash
pnpm --filter @nava-strata/config-schema generate-schema
```

## Gotchas

- **Two validators, deliberately different strictness.** `register` throws on the first problem
  and hard-fails on unimplemented evaluators/guards; `validateConfig` collects everything and
  treats those same references as `unimplementedHooks` rather than errors. A config that passes
  `validateConfig` can still be rejected by `register`.
- **The structural validators moved out of `core`.** `validateCriterionDag`,
  `validateWorkflowGraph`, and `validateNoAutoTransitionCycles` now live in `config-schema`;
  `sdk/core/src/validation/workflow.ts` is now re-export-only, and `validation/dag.ts` re-exports
  `validateCriterionDag` while keeping the runtime `topologicalSort` helper, so the public import
  path from `@nava-strata/case-management` is unchanged.
- **`effectiveDate` is coerced.** The Zod schema uses `z.coerce.date()`, so an ISO string from
  JSON is accepted and the parsed output is always a `Date`.
- **Zod's `taskActionDefinitionSchema` only shape-checks `resultSchema`** (`z.record(z.string(),
  z.unknown())`). The deeper subset check runs separately in `validateConfig`.
- **Versions are immutable but not ordered.** Re-registering `(id, version)` throws; there is no
  semantic-version comparison anywhere. Without `effectiveDate`, "current" means "last
  registered", which depends on the order you pass `configs` to `createCaseSdk`.
