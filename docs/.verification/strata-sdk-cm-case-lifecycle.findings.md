# Verification findings: strata-sdk-cm-case-lifecycle

## Round 1 → Round 2 status

Round 1 identified two low-severity findings, both addressed in the document revision:

1. ✓ **"Only keys whose value actually changes are applied"** — Doc now correctly states: "Only keys whose value actually change (`!==` comparison) are **reported** in the event's `changes` delta; the merge itself writes the whole `undefined`-filtered patch."

2. ✓ **"It returns the record re-read from the store"** — Doc now includes: "falling back to the in-memory updated record if that re-read misses."

## Round 2 re-verification

Source: `.sources/strata-sdk-case-management` @ `579d27695b7f5d655d8de020c65c256db3d05951`
(matches the doc's `source_ref.ref`).

All assertions re-verified against source:

- `CaseRecord` shape, `criteria` as a real `Map` keyed by `CriterionDefinition.id`, `version`
  starting at 1, host-owned `metadata` — `sdk/types/src/entities.ts:9-21,37-45`.
- `sdk.cases` signatures and `CreateCaseParams` fields — `sdk/types/src/sdk.ts:87-125`.
- `create` step order (config resolve → `randomUUID` → conditional `humanId` → criterion
  instances at `initialStatus` with empty `signals`/`evaluationHistory` → `version = 1`,
  `status = config.workflow.initialStatus` → `reevaluateWorkflow` → `store.insert` →
  `case-created` → workflow events) — `sdk/core/src/operations/case-operations.ts:41-114`.
- `CaseQuery` fields and `list()` passing `{}` — `sdk/types/src/ports.ts:12-19`,
  `case-operations.ts:120-122`.
- `updateMetadata` semantics: `undefined` keys dropped, `!==` per-key delta, full no-op when
  nothing changes, `case-metadata-updated` with per-key `{previous,next}` only, return value
  re-read from the store with fallback — `case-operations.ts:125-190`.
- `DefaultHumanIdGenerator` formatting (`startNumber + sequence - 1`, padding default 3,
  separator default `-`, bare padded number with no prefix), `InMemoryHumanIdStore`,
  `SqliteHumanIdStore` with the `human_id_sequences` table —
  `sdk/core/src/operations/human-id-generator.ts:39-101`.
- `createCaseSdk` default generator `new DefaultHumanIdGenerator(new InMemoryHumanIdStore())` —
  `sdk/core/src/sdk-factory.ts:63-69`.
- `CaseMutex` promise-chain semantics — `sdk/core/src/concurrency/case-mutex.ts`; five separate
  instances, one per operations class (`case`, `signal`, `evidence`, `criteria`, `workflow`).
- `CaseStore.update` optimistic-concurrency contract and `ConcurrencyError` —
  `sdk/types/src/ports.ts:25-32`, `sdk/core/src/stores/in-memory-case-store.ts:31-49`.
- `humanId` absent from `SerializedCaseRecord` and from `serializeCaseRecord` (zero `humanId`
  occurrences in `sdk/core/src/events/event-serializer.ts:504-516`).
- `InMemoryCaseStore` deep-copies on insert/update/read via `structuredClone` —
  `in-memory-case-store.ts:28,53,148-149`.

## Conclusion

**No unsupported claims remain.** The document is fully accurate and ready for publication.
