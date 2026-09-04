---
id: strata-sdk-cm-events-and-hooks
title: Domain events, message buses, and lifecycle hooks
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, events, webhooks, hooks, audit-trail, serialization]
related:
  - strata-sdk-cm-case-lifecycle
  - strata-sdk-cm-workflow
  - strata-sdk-cm-tasks
  - strata-sdk-cm-stores
  - strata-sdk-cm-evidence-signals-criteria
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The thirteen domain events, when each is published relative to persistence, the MessageBus/EventStore ports and their in-process, webhook, and composite adapters, event serialization, and the eight CaseSdkHooks.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/events.ts
    - sdk/types/src/ports.ts
    - sdk/types/src/sdk.ts
    - sdk/core/src/operations/event-operations.ts
    - sdk/core/src/events/in-process-message-bus.ts
    - sdk/core/src/events/composite-message-bus.ts
    - sdk/core/src/events/webhook-message-bus.ts
    - sdk/core/src/events/event-serializer.ts
    - sdk/core/src/hooks/hook-runner.ts
    - sdk/core/src/engine/evaluation-engine.ts
    - sdk/core/src/operations/workflow-operations.ts
    - sdk/core/src/index.ts
    - sdk/core/src/sdk-factory.ts
last_documented: 2026-09-04
verified: ok
---

# Domain events, message buses, and lifecycle hooks

Two extension surfaces, easy to confuse:

- **Events** are for delivery and for the audit log; they cannot influence the operation. *When*
  they are published depends on who raises them. The operations classes accumulate events and
  publish them after the single atomic store write (`sdk/core/src/operations/workflow-operations.ts`
  persists at step 11, then publishes at step 12). `EvaluationEngine`
  (`sdk/core/src/engine/evaluation-engine.ts`) holds no store — its constructor takes only
  evaluators, the event bus, and hooks — and publishes `rule-evaluated`,
  `rule-evaluation-failed`, and `criterion-status-changed` inline via `emitEvent` →
  `eventBus.publish`, before the caller persists. So an evaluation event can be delivered for a
  change that never commits.
- **Hooks** are consumer functions invoked *inside* an operation. One of them
  (`beforeTransition`) can block; the rest are informational.

## The event union

Every event extends `BaseEvent` = `{ id, caseId, configVersion, timestamp, actor? }`, and
`CaseEvent` is a discriminated union on `type` (`sdk/types/src/events.ts`):

| `type` | Notable payload |
|---|---|
| `case-created` | `caseRecord` (full snapshot) |
| `case-metadata-updated` | `changes: Record<string, { previous, next }>` for changed keys only |
| `criterion-status-changed` | `criterionId`, `previousStatus`, `newStatus`, `resolvedValue?`, `criterion` |
| `criterion-reopened` | `criterionId`, `previousStatus`, `criterion` (after reset) |
| `workflow-transitioned` | `previousStatus`, `newStatus`, `transitionTrigger`, `caseRecord` |
| `evidence-stored` | `evidence` (full snapshot) |
| `evidence-attached` | `criterionId`, `signal` (a signal was attached to a criterion) |
| `rule-evaluated` | `criterionId`, `evaluatorId`, `result` |
| `rule-evaluation-failed` | `criterionId`, `evaluatorId`, `error` (message string only) |
| `task-created` | `task` |
| `task-assigned` | `taskId`, `previousAssignee?`, `newAssignee` |
| `task-completed` | `taskId`, `outcome`, `task` |
| `task-cancelled` | `taskId`, `task` |

`case-metadata-updated` carries a delta rather than snapshots on purpose: the stream is ordered
and append-only, `case-created` holds the initial full snapshot, so a point-in-time value is
"base snapshot + replayed deltas" — and host metadata (potentially PII) is not duplicated on
every write.

Note the naming: `evidence-attached` is the **signal** event, not the evidence-storage event.
Storing evidence emits `evidence-stored`.

## The ports

```ts
interface MessageBus { publish(event: CaseEvent): Promise<void>; }

interface EventStore {
  save(event: CaseEvent): Promise<void>;
  getForCase(caseId: string): Promise<CaseEvent[]>;   // timestamp ascending
}
```

`options.events` (a `MessageBus`) is optional and defaults to an `InProcessEventBus`.
`options.eventStore` is optional; when present the SDK persists every event automatically.

### How the buses are wired

`createCaseSdk` builds a `CompositeMessageBus(external, internal)` where `external` is
`options.events ?? new InProcessEventBus()` and `internal` is a fresh `InProcessEventBus`. All
operations publish to the composite; `sdk.events.on/onAll` subscribe to the **internal** bus.
The composite publishes externally first, then internally with the internal error swallowed, so
an internal subscriber cannot break external delivery.

- **`InProcessEventBus`** — type-keyed and all-event listener sets. Handlers run in parallel
  (`Promise.all`) and each is individually try/caught, so a throwing listener logs and does not
  break publishing. `on()` returns an unsubscribe function.
- **`WebhookMessageBus`** — takes `WebhookConfig[]` (`{ url, headers?, timeoutMs?, retries?,
  retryDelayMs? }`; defaults 5000 ms, 2 retries, 1000 ms delay), POSTs the serialized event as
  JSON to every endpoint in parallel with `AbortController` timeouts, and is **best-effort**: it
  logs a final failure and never throws.
- **`CompositeMessageBus`** — the fan-out described above; `on`/`onAll` delegate to the internal
  bus only.

### `sdk.events`

```ts
on(eventType, handler): Unsubscribe        // typed via Extract<CaseEvent, { type: T }>
onAll(handler): Unsubscribe
getForCase(caseId): Promise<CaseEvent[]>   // [] when no eventStore is configured
```

`EventOperationsImpl` also registers the automatic persistence: when an `eventStore` is
supplied, it subscribes `onAll` to `store.save(event)` with the failure caught and logged.

## Serialization

`serializeCaseEvent` / `deserializeCaseEvent` (`sdk/core/src/events/event-serializer.ts`)
convert the non-JSON-safe parts: `Map` → plain object (`criteria`) and `Date` → ISO string
throughout. `WebhookMessageBus` and `SqliteEventStore` both go through them, and the
`Serialized*` interfaces are exported from the package barrel.

## Lifecycle hooks

`CaseSdkOptions.hooks` is a `CaseSdkHooks<TMeta>` (`sdk/types/src/sdk.ts`), all optional:

| Hook | Can block? | When |
|---|---|---|
| `beforeTransition` | **Yes** | Before a transition is applied (manual and auto) |
| `afterTransition` | No | After the in-memory transition is applied, but *before* the atomic persist |
| `onCriterionResolved` | No | A criterion reached a terminal status, before the DAG cascade |
| `onSignalReceived` | No | A signal was stored, before evaluation |
| `onEvidenceStored` | No | Evidence was stored, before derived signals are processed |
| `onEvaluationComplete` | No | After every evaluation, changed or not (`statusChanged` flag) |
| `onTaskCreated` | No | A task was created, manually or by trigger |
| `onTaskCompleted` | No | A task was completed — the main outcome-reaction point |

Each receives a typed context object carrying `caseRecord` plus the relevant entity.
`sdk/core/src/hooks/hook-runner.ts` provides `runInformationalHook` and named wrappers
(`runOnSignalReceived`, `runOnEvaluationComplete`, `runOnCriterionResolved`,
`runOnEvidenceStored`) that catch and log rather than propagate — but nothing in the SDK calls
them; they are exported-only helpers (see Gotchas).

## Gotchas

- **`humanId` does not survive serialization.** `SerializedCaseRecord` has no `humanId` field,
  so webhook payloads and events read back from `SqliteEventStore` lose the human-readable id
  even though `CaseRecord` carries it.
- **`rule-evaluation-failed` carries only the error *message*.** The error object is
  deliberately not serialized, so stack traces and custom error fields do not reach subscribers.
- **`WebhookMessageBus.on()` and `.onAll()` throw.** Passing it as `options.events` and then
  calling `sdk.events.on(...)` is fine — subscriptions go to the internal bus — but calling
  `on`/`onAll` on the webhook bus directly raises an error pointing you at
  `InProcessMessageBus` or `CompositeMessageBus`.
- **`MessageBus` in the types package declares only `publish`.** `CompositeMessageBus` types its
  internal bus as `MessageBus & { on: any; onAll: any }`, so subscription is a core-side
  convention rather than part of the port contract.
- **The hook-runner wrappers are exported but unused by the SDK itself.** A repo-wide search for
  `runInformationalHook`, `runOnSignalReceived`, `runOnEvaluationComplete`,
  `runOnCriterionResolved`, and `runOnEvidenceStored` inside `sdk/core/src` matches only their
  definitions in `hooks/hook-runner.ts`, the barrel re-exports in `index.ts`, and their own unit
  test — no operation or engine calls them. Every call site inlines its own try/catch instead
  (`engine/evaluation-engine.ts`, `operations/workflow-operations.ts`). They are dead API surface
  a consumer could call. The task hooks are awaited with no guard at all — a throwing
  `onTaskCreated`/`onTaskCompleted` propagates to the caller.
- **`afterTransition`'s doc comment contradicts the implementation.**
  `sdk/types/src/sdk.ts` says it is "called after a workflow transition is committed and
  persisted", but `workflow-operations.ts` runs it at step 8, before auto-transition settling
  (step 9), the `updatedAt` bump (step 10), and the single `store.update` (step 11). Do not rely
  on the transition being durable inside the hook.
- **`InProcessEventBus` is exported under two names.** `InProcessEventBus` and the backward
  compatibility alias `InProcessMessageBus` are the same class.
- **`getForCase` returns `[]`, not an error, without an `eventStore`.** An empty history is
  indistinguishable from "persistence not configured".
