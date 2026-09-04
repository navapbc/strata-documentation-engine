---
id: strata-sdk-cm-blueprints
title: Case management blueprints (decision criteria and program types)
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, blueprints, pfml, snap, decision-criteria, program-types]
related:
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-evidence-signals-criteria
  - strata-sdk-cm-workflow
  - strata-sdk-cm-tasks
  - strata-sdk-cm-maturity
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The off-the-shelf, jurisdiction-agnostic blueprint package — a shared decision-criteria catalog plus standalone PFML and SNAP program-type configs you copy or extend.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/case-management-blueprints/README.md
    - sdk/case-management-blueprints/package.json
    - sdk/case-management-blueprints/src/blueprint.ts
    - sdk/case-management-blueprints/src/index.ts
    - sdk/case-management-blueprints/src/decision-criteria/index.ts
    - sdk/case-management-blueprints/src/decision-criteria/identity-verified.ts
    - sdk/case-management-blueprints/src/decision-criteria/income-eligibility.ts
    - sdk/case-management-blueprints/src/decision-criteria/household-composition.ts
    - sdk/case-management-blueprints/src/program-types/index.ts
    - sdk/case-management-blueprints/src/program-types/pfml/index.ts
    - sdk/case-management-blueprints/src/program-types/pfml/workflow.ts
    - sdk/case-management-blueprints/src/program-types/pfml/tasks.ts
    - sdk/case-management-blueprints/src/program-types/snap/index.ts
    - sdk/case-management-blueprints/src/program-types/snap/workflow.ts
    - sdk/case-management-blueprints/src/program-types/snap/tasks.ts
    - sdk/case-management-blueprints/src/__tests__/blueprints.test.ts
last_documented: 2026-09-04
verified: ok
---

# Case management blueprints

`@nava-strata/case-management-blueprints` ships **off-the-shelf, jurisdiction-agnostic**
starting points for a case-management program. It holds two catalogs:

- **`decision-criteria/`** — reusable criterion *shapes* (`CriterionDefinition`s), agnostic to
  which programs consume them.
- **`program-types/`** — near-complete, **standalone** `CaseTypeConfig`s composed from that
  catalog. Today: generic **PFML** and **SNAP**.

You **copy** or **import-and-extend** a program type. Per its README they are deliberately
**not** a base config that program types inherit from.

The package's layering statement: SDK (agnostic runtime + vocabulary) → blueprints
(benefits-opinionated but jurisdiction-agnostic) → customer/jurisdiction implementations, which
live **outside this repository entirely**.

It depends only on `@nava-strata/case-management-types`, not on the core runtime, so importing
a blueprint pulls in no engine.

## What a blueprint gives you — and what it does not

> "A blueprint delivers shape, not logic."

Every `ruleEvaluatorId` and custom `guardId` in a blueprint is a **pointer to code the host must
still write**. The blueprint covers roughly the recurring eligibility *decisions* for a program
type and **none** of the jurisdiction-specific logic, thresholds, or guidance. Generated or
blueprint configs are structural drafts, not validated program specifications
(see [SDK maturity and workarounds](./strata-sdk-cm-maturity.md)).

## `ProgramTypeBlueprint`

```ts
export const BLUEPRINT_SCHEMA_VERSION = '0.1.0';
export type ProgramTypeBlueprint = CaseTypeConfig & { schemaVersion: string };
```

`schemaVersion` is the extra property the SDK validator reads; `BLUEPRINT_SCHEMA_VERSION`
mirrors `SCHEMA_VERSION` in `@nava-strata/config-schema`, and a drift test asserts they match
so a stale blueprint cannot silently validate against a newer schema.

## The decision-criteria catalog

Fourteen shapes, exported individually and as `decisionCriteriaCatalog: CriterionDefinition[]`:

| Criterion id | Rule evaluator id |
|---|---|
| `identity-verified` | `identity-verification` |
| `residency-verified` | `residency-verification` |
| `wage-eligibility` | `wage-eligibility-check` |
| `qualifying-leave-reason` | `leave-reason-check` |
| `medical-certification` | `medical-certification-check` |
| `employer-verification` | `employer-verification-check` |
| `leave-duration` | `leave-duration-check` |
| `submission-timeliness` | `submission-timeliness-check` |
| `benefit-coordination` | `benefit-coordination-check` |
| `covered-employment` | `covered-employment-check` |
| `household-composition` | `household-composition-check` |
| `income-eligibility` | `snap-income-eligibility-check` |
| `resource-limit` | `resource-limit-check` |
| `work-requirement` | `work-requirement-check` |

Each file carries a substantial doc comment stating the decision, the questions it resolves,
anticipated evidence shapes, the expected signal keys and their value shapes, the actors, and
what the evaluator is responsible for. Example:

```ts
export const identityVerifiedCriterion: CriterionDefinition = {
  id: 'identity-verified',
  name: 'Identity verified',
  dependsOn: [],
  initialStatus: 'pending',
  terminalStatuses: ['verified', 'flagged', 'failed'],
  statusProgression: ['pending', 'verified', 'flagged', 'failed'],
  expectedSignals: ['id-match-confidence', 'name-match', 'name-mismatch'],
  ruleEvaluatorId: 'identity-verification',
  terminalStatusColorsJson: JSON.stringify({ verified: 'green', flagged: 'amber', failed: 'red' }),
};
```

## The program types

`programTypeCatalog` is `{ pfml: pfmlProgramType, snap: snapProgramType }`.

**PFML** (`id: 'pfml'`, `version: 'v1'`, human ids `PFML-0001`): ten criteria — identity,
residency, wage eligibility, qualifying leave reason, medical certification, employer
verification, leave duration, plus the coverage/coordination trio (submission timeliness,
benefit coordination, covered employment) surfaced by mapping a real state backlog schema onto
the blueprint. Workflow `submitted → in-review → approved | denied | withdrawn`, with an
`information-requested` detour; every transition is `manual`. Three task definitions:
`staff-review`, `information-request-followup`, and a `medical-certification-review` triggered
by `medical-certification` resolving to `flagged`.

**SNAP** (`id: 'snap'`, `version: 'v1'`, human ids `SNAP-0001`): six criteria — identity,
residency, household composition, income eligibility, resource limit, work requirement.
Its workflow differs from PFML's by a **mandatory eligibility interview** between intake and
review (`submitted → interview-scheduled → in-review`), including a
`deny-failure-to-appear` path. Tasks: `eligibility-interview`, `staff-review`,
`information-request-followup`.

Both programs gate `in-review → approved` on `{ type: 'all-criteria-resolved' }` **and**
`{ type: 'custom', guardId: 'supervisor-sign-off' }`. PFML and SNAP intentionally share exactly
two catalog shapes — `identity-verified` and `residency-verified` — which the package's tests
assert, demonstrating partial rather than total overlap.

## Using one

```ts
import { pfmlProgramType, decisionCriteriaCatalog } from '@nava-strata/case-management-blueprints';

// Start from the near-complete config and specialize for your jurisdiction.
const myProgram = structuredClone(pfmlProgramType);
myProgram.id = 'my-state-pfml';
```

Because `register` rejects a config whose evaluator and guard ids are unregistered, you must
supply implementations for every `ruleEvaluatorId` the config names — ten for PFML, six for
SNAP — plus the `supervisor-sign-off` guard, before `createCaseSdk` will accept it. Run `validateConfig` on the
config first to get that list as `unimplementedHooks`.

## Gotchas

- **`income-eligibility` carries a SNAP-prefixed evaluator id** (`snap-income-eligibility-check`)
  and `dependsOn: ['household-composition']`, even though the catalog claims to be agnostic to
  the programs that consume it. Composing `income-eligibility` without also including
  `household-composition` fails DAG validation at registration.
- **The catalog is not a config.** `decisionCriteriaCatalog` is a flat array of shapes with no
  workflow; only a program type is a registrable `CaseTypeConfig`.
- **`structuredClone` gives you a full deep copy, not a merge.** There is no supported
  "extend the base" mechanism, and none is intended — each program-type blueprint stands alone.
- **No blueprint task action declares a `resultSchema`.** Outcome payloads on blueprint tasks
  are unvalidated until you add one (see [Tasks](./strata-sdk-cm-tasks.md)).
- **Jurisdiction specifics must not land here.** The README is explicit that state or customer
  logic (Virginia, Minnesota) belongs to host implementations, and the layering exists to keep
  it out of the package.
- **The package lives under `sdk/` but is not an SDK package.** Its README says so directly: it
  sits there because it depends entirely on the SDK family, but it is the benefits-opinionated
  layer above the agnostic runtime.
