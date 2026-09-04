---
id: strata-sdk-cm-evidence-signals-criteria
title: Evidence, signals, and decision criteria
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, evidence, signals, criteria, evaluation, dag]
related:
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-case-lifecycle
  - strata-sdk-cm-workflow
  - strata-sdk-cm-events-and-hooks
  - strata-sdk-cm-blueprints
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The evidence/signal/criterion data model, the rule-evaluator contract, forward-only status progression, and the dependency-DAG evaluation cascade.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/entities.ts
    - sdk/types/src/evaluation.ts
    - sdk/types/src/events.ts
    - sdk/types/src/signals.ts
    - sdk/types/src/sdk.ts
    - sdk/types/src/errors.ts
    - sdk/core/src/operations/signal-operations.ts
    - sdk/core/src/operations/evidence-operations.ts
    - sdk/core/src/operations/criteria-operations.ts
    - sdk/core/src/engine/evaluation-engine.ts
    - sdk/core/src/evaluation/cascade.ts
    - sdk/core/src/validation/dag.ts
    - sdk/config-schema/src/structural/dag.ts
last_documented: 2026-09-04
verified: ok
---

# Evidence, signals, and decision criteria

Three layered concepts, and they are not interchangeable:

- **Evidence** — a stored external data payload, kept opaquely. The system of record for
  *what an external source actually said*, with chain-of-custody metadata.
- **Signal** — an extracted fact derived from evidence (or computed), a small `key`/`value` pair
  attached to one criterion. Signals are the inputs to evaluation.
- **Criterion** — one decision on the case (`CriterionDefinition` at config time,
  `CriterionInstance` at runtime), resolved by a host-supplied rule evaluator.

## Evidence

```ts
interface Evidence {
  id: string;
  sourceType: string;                    // e.g., "irs-w2", "employer-verify"
  sourceId: string;                      // e.g., "irs-api-prod"
  data: Record<string, unknown>;         // full payload, stored opaquely
  retrievedAt: Date;
  receivedAt: Date;
  provenance: EvidenceProvenance;        // { method, retrievedBy?, externalId?, sourceVersion?, metadata? }
  displayHint?: EvidenceDisplayHint;     // { label, format?, displayFields? }
}
```

`sdk.evidence` operations (`sdk/core/src/operations/evidence-operations.ts`):

```ts
add(caseId, input): Promise<{ evidence: Evidence; caseRecord: CaseRecord<TMeta> }>
addWithSignals(caseId, input, signals: EvidenceSignalInput[]): Promise<CaseRecord<TMeta>>
list(caseId): Promise<Evidence[]>
get(caseId, evidenceId): Promise<Evidence | null>
```

`add` stores the payload, appends it to `caseRecord.evidence`, persists, emits
`evidence-stored`, and runs the `onEvidenceStored` hook. It does **not** trigger evaluation.

`addWithSignals` is the atomic combination: it validates every `signal.criterionId` against
the config **before** storing anything, stores the evidence, attaches each signal (auto-linking
`evidenceId`), and only then evaluates — in one `store.update` for the whole operation. Each
`EvidenceSignalInput` is `{ criterionId, key, value, sourceId?, metadata? }`, with `sourceId`
defaulting to the evidence's `sourceId`. There is no `collectedAt` on that input: on this path
`evidence-operations.ts` always stamps `collectedAt` with the store time.

## Signals

```ts
interface Signal {
  id: string;
  sourceId: string;
  key: string;                    // e.g., "gross-wages"
  value: unknown;
  collectedAt: Date;
  metadata?: Record<string, unknown>;
  evidenceId?: string;            // links back to the Evidence it came from
}
```

The write-side `SignalInput` is the same shape with `collectedAt?: Date` — *that* is the field
annotated `// defaults to now`, and it is where a caller may supply a collection time.

`sdk.signals.push(caseId, criterionId, signal)` is the primary ingestion point. Per
`SignalOperationsImpl.push`, under the case mutex it:

1. Validates the criterion exists in the case type's config
   (`InvalidOperationError` otherwise) and that `signal.evidenceId`, if given, references
   evidence already on the case.
2. Appends the built `Signal` to the criterion instance and emits `evidence-attached`.
3. Runs the `onSignalReceived` hook.
4. **If the criterion is already in a terminal status, it stores the signal and stops** — no
   evaluation, no cascade.
5. Otherwise evaluates the criterion and cascades to dependents.
6. Re-evaluates workflow guards and fires auto-transitions.
7. Persists once (a single `store.update`), then publishes the events it accumulated — the
   `evidence-attached` signal event and any workflow events. The evaluation events
   (`rule-evaluated`, `criterion-status-changed`, `rule-evaluation-failed`) are *not* in that
   batch: `EvaluationEngine.emitEvent` publishes them straight to the bus during evaluation, so
   they reach subscribers **before** the case is persisted.

Three helpers for writing evaluators live in `sdk/types/src/signals.ts` and are exported from
the types package: `findSignal(signals, key)`, `hasSignal(signals, key)`, and
`signalValue<T>(signals, key)`.

## Criteria

Config-time (`CriterionDefinition`):

```ts
{
  id: string;
  name: string;
  dependsOn: string[];                    // other criterion ids -> the DAG
  initialStatus: string;
  terminalStatuses: string[];             // "resolved" statuses
  statusProgression: string[];            // allowed statuses, in order; forward-only
  expectedSignals?: string[];             // documentation / validation only
  expectedEvidence?: string[];            // documentation / validation only
  ruleEvaluatorId: string;                // key into options.evaluators
  terminalStatusColorsJson?: string | null;  // display only
}
```

Runtime (`CriterionInstance`): `{ definitionId, status, resolvedValue?, signals, evaluationHistory, updatedAt }`.
Each evaluation appends an `EvaluationRecord` — `{ evaluatorId, timestamp, previousStatus,
newStatus, resolvedValue?, signals: string[] }` — giving a per-criterion audit trail. The
`signals` array holds the **ids of all signals on the criterion at evaluation time**, not just
the newly arrived one.

### The rule-evaluator contract

`RuleEvaluatorFn` and `EvaluationContext` live in `sdk/types/src/evaluation.ts`;
`EvaluationResult` is declared alongside the event types in `sdk/types/src/events.ts` and
re-imported there.

```ts
type RuleEvaluatorFn = (context: EvaluationContext) => EvaluationResult | Promise<EvaluationResult>;

interface EvaluationContext {
  criterion: CriterionInstance;
  dependencies: ReadonlyMap<string, CriterionInstance>;   // only direct dependsOn entries
  caseRecord: Readonly<CaseRecord>;
}

interface EvaluationResult {
  status: string;             // the new criterion status
  resolvedValue?: unknown;    // outcome value if terminal
  reasoning?: string;         // human-readable explanation, for audit
}
```

Evaluators are **host code**, registered by id in `createCaseSdk({ evaluators })`. The config
only names them. Blueprint configs ship with `ruleEvaluatorId` pointers and no logic at all —
see [Blueprints](./strata-sdk-cm-blueprints.md).

### Evaluation rules enforced by the engine

`EvaluationEngine.evaluateCriterion` (`sdk/core/src/engine/evaluation-engine.ts`):

- Skips evaluation entirely when the criterion is already terminal.
- Throws a plain `Error` — out to the caller, *before* the guarded block — if the criterion
  definition is missing from the config, the criterion instance is missing from the case, or the
  criterion's `ruleEvaluatorId` is not registered. These reject the caller's promise and emit no
  event.
- Validates the returned status is in `statusProgression`, and that the move is **forward-only**
  — a lower index than the current status raises `EvaluationError`.
- Errors thrown *inside* the evaluator, plus those two `validateEvaluationResult` failures, are
  caught: the engine emits `rule-evaluation-failed` and returns the case **unchanged**.
- On success it emits `rule-evaluated`, applies the result, runs `onEvaluationComplete`, and if
  the status changed emits `criterion-status-changed` — plus `onCriterionResolved` when the new
  status is terminal.

### The cascade

When a criterion changes, dependents must be re-evaluated. `evaluateWithCascade` computes the
transitive closure of dependents, topologically sorts that subgraph
(`topologicalSort`, Kahn's algorithm, in `sdk/core/src/validation/dag.ts`), and evaluates in
dependency order. `validateCriterionDag` (now in `@nava-strata/config-schema`) guarantees at registration both that
every `dependsOn` id names a defined criterion and that the graph is acyclic; either failure throws
`ConfigurationError`, the cyclic one reporting the cycle path.

## `sdk.criteria`

```ts
reopen(caseId, criterionId, actor?): Promise<CaseRecord<TMeta>>
evaluate(caseId, criterionId): Promise<CaseRecord<TMeta>>
```

`reopen` requires the criterion to be **in** a terminal status (otherwise
`InvalidOperationError: nothing to reopen`), and refuses when the case is in a terminal
workflow state — a state with no outgoing transitions — with `cannot reopen criteria after case
determination`. It resets `status` to `initialStatus`, clears `resolvedValue`, **preserves
`signals` and `evaluationHistory`** for audit, emits `criterion-reopened`, and does **not**
cascade-reopen dependents.

`evaluate` is the mirror image: it refuses a criterion that **is** terminal
(`resolved criteria cannot be re-evaluated; reopen first`) and re-runs evaluation with current
signals and dependency state, cascading on change.

## Gotchas

- **`expectedSignals` and `expectedEvidence` are documentation.** Nothing validates that a
  pushed signal's `key` is in `expectedSignals`, or that stored evidence matches
  `expectedEvidence`. They describe intent for humans and tooling.
- **An evaluator that throws is silent to the caller.** When the evaluator itself throws, or its
  result fails status validation, `signals.push` resolves normally after a
  `rule-evaluation-failed` event; the criterion simply did not move. Subscribe to
  `rule-evaluation-failed` if you need to know. Misconfiguration is the opposite: an unregistered
  `ruleEvaluatorId` (or a missing criterion) throws out of the call.
- **Forward-only progression is index-based.** `statusProgression` order *is* the rule, so
  putting a rejection status before a success status makes the rejection unreachable from the
  success state. Many blueprint criteria use `['pending', 'verified', 'failed']` — `leave-duration`,
  for one, so it can go `verified -> failed` but never `failed -> verified`. Others insert
  `flagged` and/or append `not-applicable` (`identity-verified`, `employer-verification`,
  `medical-certification`), and `work-requirement` uses a different vocabulary entirely,
  `['pending', 'met', 'exempt', 'not-met']`. Read the criterion's own progression rather than
  assuming a shared one.
- **Two cascade implementations exist.** `EvaluationEngine.evaluateWithCascade` (used by
  `signals.push` and `criteria.evaluate`) recomputes the affected set inline, while
  `sdk/core/src/evaluation/cascade.ts` exports a separate `cascadeEvaluation` built on a reverse
  dependency graph. Both are exported from the package barrel; only the engine's version is on
  the `sdk.*` path.
- **`criteria.evaluate` publishes before it persists.** An in-code note (`NOTE(#131)`) records
  that this one operation publishes workflow events *before* `store.update`, unlike every other
  mutation, which persists first. Treat event ordering there as not-yet-guaranteed.
- **`addWithSignals` also opportunistically evaluates untouched criteria.** Beyond the criteria
  that received signals, it marks any non-terminal criterion whose dependencies have all become
  terminal *and* which already has signals. That is broader than what `signals.push` does one
  signal at a time.
