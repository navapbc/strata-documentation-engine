---
id: strata-sdk-cm-case-lifecycle
title: The case record and case lifecycle operations
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, case-record, metadata, concurrency, human-id]
related:
  - strata-sdk-cm-getting-started
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-workflow
  - strata-sdk-cm-stores
  - strata-sdk-cm-events-and-hooks
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The CaseRecord aggregate, sdk.cases create/get/list/updateMetadata, human-readable ids, and the per-case mutex plus optimistic-concurrency model.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/entities.ts
    - sdk/types/src/sdk.ts
    - sdk/types/src/ports.ts
    - sdk/types/src/errors.ts
    - sdk/types/src/events.ts
    - sdk/core/src/operations/case-operations.ts
    - sdk/core/src/operations/human-id-generator.ts
    - sdk/core/src/concurrency/case-mutex.ts
    - sdk/core/src/sdk-factory.ts
    - sdk/core/src/stores/in-memory-case-store.ts
    - sdk/core/src/events/event-serializer.ts
last_documented: 2026-09-04
verified: ok
---

# The case record and case lifecycle operations

## `CaseRecord`

The aggregate root (`sdk/types/src/entities.ts`), generic over the host's metadata type:

```ts
interface CaseRecord<TMeta = Record<string, unknown>> {
  id: string;                                  // randomUUID()
  humanId?: string;                            // e.g., "PFML-0001"
  version: number;                             // optimistic concurrency token, starts at 1
  caseTypeId: string;
  configVersion: string;
  status: string;                              // current workflow state
  criteria: Map<string, CriterionInstance>;    // keyed by CriterionDefinition.id
  evidence: Evidence[];
  metadata: TMeta;
  createdAt: Date;
  updatedAt: Date;
}
```

`criteria` is a real `Map`, and `createdAt` / `updatedAt` are real `Date`s — both matter when
you serialize a record yourself (the SDK's own event serializer handles them; see
[Events and hooks](./strata-sdk-cm-events-and-hooks.md)).

`metadata` is **host-owned**. The SDK never interprets it; it is where program-specific data
that the SDK has no primitive for belongs.

## `sdk.cases`

```ts
create(params: CreateCaseParams<TMeta>): Promise<CaseRecord<TMeta>>
get(caseId: string): Promise<CaseRecord<TMeta> | null>
list(query?: CaseQuery): Promise<CaseRecord<TMeta>[]>
updateMetadata(caseId: string, patch: Partial<TMeta>, actor?: string): Promise<CaseRecord<TMeta>>
```

### `create`

`CreateCaseParams` is `{ caseTypeId, metadata, configVersion?, actor? }`. `CaseOperationsImpl.create`
(`sdk/core/src/operations/case-operations.ts`):

1. Resolves the config — the exact `configVersion` if given, otherwise `current(caseTypeId)`.
2. Assigns `id = randomUUID()`.
3. Generates `humanId` **only if** the config has a `humanIdConfig` *and* a generator is wired.
4. Materializes one `CriterionInstance` per `CriterionDefinition`, at that definition's
   `initialStatus`, with empty `signals` and `evaluationHistory`.
5. Sets `status = config.workflow.initialStatus` and `version = 1`.
6. Settles auto-transitions from the initial status (`WorkflowEngine.reevaluateWorkflow`).
7. `store.insert(...)`, then publishes `case-created`, then any `workflow-transitioned` events
   produced by step 6.

The returned record already reflects any auto-transition that fired.

### `list`

`CaseQuery` (`sdk/types/src/ports.ts`) supports `caseTypeId`, `status` (string or array),
`configVersion`, `humanId`, `limit`, `offset`. `list()` with no argument passes `{}`.

### `updateMetadata`

A **shallow merge** with carefully defined semantics, all implemented in
`CaseOperationsImpl.updateMetadata`:

- Keys explicitly set to `undefined` in the patch are **ignored**; use `null` to unset a key.
- Only keys whose value actually changes (`!==` comparison) are **reported** in the event's
  `changes` delta; the merge itself writes the whole `undefined`-filtered patch
  (`{ ...previousMetadata, ...effectivePatch }`).
- If nothing changes it is a **complete no-op**: no store write, no event, no version bump, and
  the current record is returned unchanged.
- On a real change it emits `case-metadata-updated`, whose `changes` field is a per-key
  `{ previous, next }` delta for the changed keys only — deliberately **not** full before/after
  snapshots, so the event log does not duplicate potentially PII-laden host metadata.
- It returns the record re-read from the store, so the caller sees the store-assigned `version`
  bump rather than the pre-write value, falling back to the in-memory updated record if that
  re-read misses.

## Human-readable ids

`DefaultHumanIdGenerator` (`sdk/core/src/operations/human-id-generator.ts`) formats
`{prefix}{separator}{number}` where the number is `startNumber + sequence - 1`, zero-padded to
`padding` digits (default 3). With no `prefix` the result is just the padded number. Sequence
allocation is delegated to a `HumanIdStore`: `InMemoryHumanIdStore` or `SqliteHumanIdStore`
(which keeps a `human_id_sequences` table).

`createCaseSdk` defaults to `new DefaultHumanIdGenerator(new InMemoryHumanIdStore())` when
`options.humanIdGenerator` is not supplied.

## Concurrency

Two independent mechanisms:

- **Per-case mutex** (`CaseMutex`, `sdk/core/src/concurrency/case-mutex.ts`). A promise chain
  keyed by case id: operations on *different* cases run concurrently, operations on the *same*
  case are serialized. Each operations class instantiates **its own** `CaseMutex`.
- **Optimistic concurrency in the store.** `CaseStore.update` must compare the incoming
  `caseRecord.version` against the stored version, throw `ConcurrencyError` on a mismatch, and
  increment the version on success.

## Gotchas

- **The mutex is per-operations-object and single-process.** `CaseOperationsImpl`,
  `SignalOperationsImpl`, `EvidenceOperationsImpl`, `CriteriaOperationsImpl`, and
  `WorkflowOperationsImpl` each construct a separate `CaseMutex`, so a `signals.push` and a
  `cases.updateMetadata` on the same case are **not** mutually excluded — only the store's
  version check protects that interleaving. Across processes the mutex gives you nothing.
- **`humanId` is only generated when `humanIdConfig` is present.** A config without it yields
  cases with `humanId: undefined`, and `CaseQuery.humanId` will never match them.
- **`humanId` is dropped by the event serializer.** `SerializedCaseRecord` in
  `sdk/core/src/events/event-serializer.ts` has no `humanId` field, so a case's human id does
  not survive webhook delivery or `SqliteEventStore` round-trips.
- **`create` publishes after insert, in two steps.** `case-created` is published before the
  auto-transition events, so a subscriber to `workflow-transitioned` sees the case already at
  its settled status while `case-created` carries the same settled snapshot.
- **`InMemoryCaseStore` deep-copies with `structuredClone`.** Records you get back are
  snapshots, not live references — mutating one does not affect stored state. Persistent stores
  reconstruct records from rows, giving the same effect.
