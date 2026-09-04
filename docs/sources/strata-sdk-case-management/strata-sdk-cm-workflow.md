---
id: strata-sdk-cm-workflow
title: Workflow, transitions, and guards
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, workflow, state-machine, guards, transitions]
related:
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-case-lifecycle
  - strata-sdk-cm-evidence-signals-criteria
  - strata-sdk-cm-tasks
  - strata-sdk-cm-events-and-hooks
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The workflow state machine — transition triggers, the three guard types, manual transitions, auto-transition settling, and the transition error hierarchy.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/workflow.ts
    - sdk/types/src/evaluation.ts
    - sdk/types/src/errors.ts
    - sdk/types/src/sdk.ts
    - sdk/core/src/operations/workflow-operations.ts
    - sdk/core/src/engine/workflow-engine.ts
    - sdk/core/src/workflow/guard-evaluator.ts
    - sdk/core/src/workflow/index.ts
    - sdk/config-schema/src/structural/workflow.ts
    - sdk/config-schema/src/schema.ts
last_documented: 2026-09-04
verified: ok
---

# Workflow, transitions, and guards

A case's `status` is a state in the config's `WorkflowDefinition`. Every state change goes
through a declared transition.

```ts
interface WorkflowDefinition {
  id: string;
  initialStatus: string;
  transitions: WorkflowTransition[];
}

interface WorkflowTransition {
  from: string;
  to: string;
  trigger: TransitionTrigger;
  guards?: TransitionGuard[];      // ALL must pass
}
```

## Triggers

```ts
type TransitionTrigger =
  | { type: 'auto' }                            // fires as soon as guards are satisfied
  | { type: 'manual'; action: string }          // requires an explicit sdk.workflow.transition() call
  | { type: 'event'; eventType: string };       // deferred from POC
```

The `'event'` variant is accepted by the type and the Zod schema, but the engine only ever
filters on `'auto'` and `'manual'` — an `event` transition never fires. The type's own comment
says it is "deferred from POC; auto+guard covers POC use cases".

## Guards

```ts
type TransitionGuard =
  | { type: 'criterion-status'; criterionId: string; requiredStatus: string | string[] }
  | { type: 'all-criteria-resolved' }
  | { type: 'custom'; guardId: string };
```

`evaluateGuards` (`sdk/core/src/workflow/guard-evaluator.ts`) evaluates **all** guards without
short-circuiting, so the caller gets the complete blocking set, and returns
`{ satisfied, failedGuards }` as **data — it never throws**.

- `criterion-status` — the named criterion's current status equals the required one, or is a
  member of the required array. A missing criterion instance fails the guard.
- `all-criteria-resolved` — every criterion in the config is in one of its own
  `terminalStatuses`. A missing instance fails.
- `custom` — invokes `options.guards[guardId]`, a `CustomGuardFn` receiving
  `{ caseRecord, transition, actor? }` and returning `boolean | Promise<boolean>`. An
  unregistered guard id fails. **A throwing guard is logged and treated as failed**, never
  propagated.

## `sdk.workflow`

```ts
transition(caseId, action, actor?): Promise<CaseRecord<TMeta>>
getAvailable(caseId): Promise<AvailableTransition[]>
```

### `transition`

`WorkflowOperationsImpl.transition` runs under the case mutex:

1. Load the case; `CaseNotFoundError` if absent.
2. Find the transition where `from === status`, `trigger.type === 'manual'`, and
   `trigger.action === action`. No match throws `InvalidTransitionError`, which carries
   `currentStatus`, `attemptedAction`, and the list of `availableActions` from that state.
3. Evaluate guards; on failure throw `GuardNotSatisfiedError` carrying `failedGuards`.
4. Run `beforeTransition`. Returning `false` **or throwing** raises `TransitionBlockedError`.
5. Apply the new status and build the `workflow-transitioned` event.
6. Run `afterTransition` (informational — errors are logged, never propagated).
7. Settle auto-transitions from the new state, accumulating their events.
8. One `store.update`, then publish all accumulated events in order.

### `getAvailable`

Returns one `AvailableTransition` — `{ transition, guardsSatisfied, blockedGuards? }` — per
**manual** transition out of the current state, with guards already evaluated so a UI can render
enabled and blocked actions together. Auto transitions are filtered out.

## Auto-transition settling

`WorkflowEngine.reevaluateWorkflow` is called after case creation, after `signals.push`, after
`evidence.addWithSignals`, after `criteria.reopen`, and after `criteria.evaluate`. It loops:
find `auto` transitions out of the current status, take the **first** whose guards are satisfied,
run `beforeTransition`, apply it, emit `workflow-transitioned`, run `afterTransition`, and repeat
from the new state until no auto transition is satisfied.

For auto transitions the `beforeTransition` contract is weaker than for manual ones: returning
`false` **skips** the transition rather than erroring, and a thrown error is caught, logged, and
also treated as a skip — explicitly "to prevent deadlock".

`validateNoAutoTransitionCycles` at registration guarantees this loop terminates;
`validateWorkflowGraph` guarantees no state is unreachable from `initialStatus`.

## Gotchas

- **A "terminal" workflow state is inferred, not declared.** There is no terminal-state field;
  `CriteriaOperationsImpl.isTerminalWorkflowState` treats *any* state with no outgoing
  transitions as terminal. Adding a transition out of an end state silently makes it non-terminal
  and re-enables `criteria.reopen`.
- **`reevaluateWorkflow` mutates the case record in place.** `WorkflowEngine.settleAutoTransitions`
  assigns `caseRecord.status = ...` directly and the wrapper returns the same object it was
  given, so callers holding a reference see the mutation before persistence.
- **Auto-transition settling is duplicated.** `WorkflowOperationsImpl` has its own private
  `settleAutoTransitions` that is a near-copy of `WorkflowEngine`'s. Behavior changes need both.
- **First satisfied auto transition wins.** Ordering within `transitions` is significant when a
  state has several `auto` edges whose guards can both pass; there is no priority field.
- **`beforeTransition` fires for auto transitions too**, and the case record it receives is the
  live, pre-transition object rather than a copy, despite the `Readonly<...>` context type.
- **Guard failures reach you differently by path.** `transition()` throws
  `GuardNotSatisfiedError`; `getAvailable()` reports the same condition as
  `guardsSatisfied: false` plus `blockedGuards`; auto settling just declines to fire.
