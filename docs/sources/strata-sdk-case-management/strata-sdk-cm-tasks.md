---
id: strata-sdk-cm-tasks
title: Tasks and structured task outcomes
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, tasks, task-triggers, result-schema, outcomes]
related:
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-workflow
  - strata-sdk-cm-evidence-signals-criteria
  - strata-sdk-cm-events-and-hooks
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: Task definitions and triggers, the TaskOperations lifecycle, and the minimal JSON-Schema subset the SDK enforces on task outcome payloads.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/tasks.ts
    - sdk/types/src/result-schema.ts
    - sdk/types/src/errors.ts
    - sdk/types/src/events.ts
    - sdk/core/src/operations/task-operations.ts
    - sdk/core/src/sdk-factory.ts
    - sdk/core/src/index.ts
    - sdk/config-schema/src/structural/result-schema.ts
    - sdk/case-management-blueprints/src/program-types/pfml/tasks.ts
last_documented: 2026-09-04
verified: ok
---

# Tasks and structured task outcomes

Tasks are actionable work items on a case — created by a declarative trigger or manually,
optionally assigned, and completed by taking one of a defined set of actions. Completion carries
structured outcome data the host uses to feed results back into the case.

## Task definitions

```ts
interface TaskDefinition {
  id: string;                            // e.g., "document-review"
  description: string;
  actions: TaskActionDefinition[];       // { id, label, resultSchema? }
  trigger?: TaskTrigger;
  defaultAssignee?: string;
}

type TaskTrigger =
  | { type: 'workflow-status'; status: string }
  | { type: 'criterion-resolved'; criterionId: string; resolvedValue?: unknown };
```

Definitions live on `CaseTypeConfig.taskDefinitions`. A grounded example from
`sdk/case-management-blueprints/src/program-types/pfml/tasks.ts`:

```ts
{
  id: 'medical-certification-review',
  description: 'Clinically review a flagged medical certification',
  trigger: {
    type: 'criterion-resolved',
    criterionId: 'medical-certification',
    resolvedValue: 'flagged',
  },
  defaultAssignee: 'clinical-reviewer',
  actions: [
    { id: 'accepted', label: 'Certification accepted' },
    { id: 'rejected', label: 'Certification rejected' },
  ],
}
```

## Automatic creation

`createCaseSdk` wires trigger handling onto the SDK's **internal** event bus in
`registerEventTriggers` (`sdk/core/src/sdk-factory.ts`), deliberately post-persistence:

- On `workflow-transitioned`, every task definition whose trigger is
  `{ type: 'workflow-status', status }` matching the new status is created.
- On `criterion-status-changed`, and only when the new status is terminal (`unresolved` and
  `blocked` return early before any definition is examined), every definition whose trigger is
  `{ type: 'criterion-resolved', criterionId }` matching is created — and when the trigger
  specifies `resolvedValue`, only if the event's `resolvedValue` matches it.

Both paths **de-duplicate**: a task is skipped if the case already has one for that definition
with status `open` or `completed`. Tasks are created with `actor: 'system'`.

Both trigger handlers resolve the config with `configRegistry.current(caseRecord.caseTypeId)` —
the *latest* config for the case type — while `TaskOperationsImpl.create` validates the
`taskDefinitionId` against `configRegistry.resolve(caseTypeId, caseRecord.configVersion)`, the
version pinned on the case.

## `TaskInstance` and `sdk.tasks`

```ts
interface TaskInstance {
  id: string;
  caseId: string;
  taskDefinitionId: string;
  status: 'open' | 'completed' | 'cancelled';
  description: string;
  assignee?: string;
  outcome?: TaskOutcome;             // { actionId, data?, actor? }
  createdAt: Date;
  assignedAt?: Date;
  dueDate?: Date;
  completedAt?: Date;
}
```

```ts
create(params: CreateTaskParams): Promise<TaskInstance>
complete(taskId, actionId, data?, actor?): Promise<TaskInstance>
cancel(taskId, actor?): Promise<TaskInstance>
assign(taskId, assignee, actor?): Promise<TaskInstance>
get(taskId): Promise<TaskInstance | null>
listForCase(caseId, filter?): Promise<TaskInstance[]>
listForAssignee(assignee, filter?): Promise<TaskInstance[]>   // the "My Tasks" view
```

Behavior from `TaskOperationsImpl` (`sdk/core/src/operations/task-operations.ts`):

- `create` requires the case to exist (`CaseNotFoundError`) and the `taskDefinitionId` to be in
  the config resolved at the case's pinned `configVersion` (`ConfigurationError`). `description` falls back to the definition's,
  `assignee` to its `defaultAssignee`, and `assignedAt` is set **only** when `params.assignee`
  was supplied. Emits `task-created`, then runs `onTaskCreated`.
- `complete` requires status `open`, validates `actionId` against the definition's actions,
  enforces the action's `resultSchema` (below), then records
  `outcome = { actionId, data, actor }`, sets `completedAt`, emits `task-completed`, and runs
  `onTaskCompleted` — the primary hook for reacting to a staff decision by pushing signals or
  adding evidence.
- `cancel` and `assign` both require status `open`, emitting `task-cancelled` /
  `task-assigned`.
- `listForCase` / `listForAssignee` accept `TaskFilter` = `{ status? }`.

## Structured outcomes: the `resultSchema` subset

A `TaskActionDefinition.resultSchema` is typed `Record<string, unknown>` but interpreted as a
deliberately **minimal JSON-Schema subset**, defined by `ResultSchema` in
`sdk/types/src/result-schema.ts` and implemented once in
`sdk/config-schema/src/structural/result-schema.ts`:

- **Understood keywords**: top-level `type`, `required`, `properties`; per-property `type` and
  `enum`.
- The subset is **object-shaped** — a top-level `type`, if present, must be `'object'`.
- **Unknown keywords are ignored**, so a richer JSON Schema is accepted but only partially
  enforced.
- **`additionalProperties` is not enforced** — extra outcome fields are accepted.
- `type: 'integer'` maps onto a JS number.
- Recognized property types (`KNOWN_JSON_SCHEMA_TYPES`): `object`, `array`, `string`, `number`,
  `integer`, `boolean`, `null`.

Two enforcement sites share that one implementation:

- `validateResultSchemaShape` — **config time**, called from `validateConfig`, so a malformed
  outcome contract is caught before any case exists.
- `validateOutcomeData(data, resultSchema)` — **completion time**, called from
  `tasks.complete()`. It returns human-readable violations; a non-empty list makes `complete`
  throw `TaskOutcomeValidationError`, which carries `taskDefinitionId`, `actionId`, and the
  `violations` array so a host UI can show exactly what was wrong.

`validateOutcomeData` is re-exported from `@nava-strata/case-management`
(`sdk/core/src/index.ts`) so a host can pre-validate a form payload against exactly the rules
`complete()` will enforce.

```ts
import { validateOutcomeData } from '@nava-strata/case-management';

const violations = validateOutcomeData(formData, action.resultSchema);
if (violations.length === 0) {
  await sdk.tasks.complete(task.id, action.id, formData, currentUser);
}
```

## Gotchas

- **Neither blueprint action declares a `resultSchema`.** Every PFML and SNAP task action in
  `sdk/case-management-blueprints` is `{ id, label }` only, so outcome payloads there are
  unvalidated. Add a `resultSchema` when the outcome data actually matters.
- **`resultSchema` enforcement is partial by design.** Absent `data` is treated as `{}`, so
  `required` fields are reported missing rather than throwing; nested object schemas, string
  formats, numeric bounds, and `additionalProperties` are all ignored.
- **`cancel` reuses `completedAt`.** A cancelled task gets `completedAt` set to the cancellation
  time; there is no separate `cancelledAt`.
- **`TaskOperationsImpl` has no case mutex and no `TMeta` generic.** It is typed
  `CaseStore<any>` and takes no lock, so concurrent completions of different tasks on one case
  are not serialized against each other or against case mutations.
- **`onTaskCreated` and `onTaskCompleted` are not error-isolated.** Unlike the informational
  hooks in the signal/evidence paths, these are awaited without a try/catch, so a throwing hook
  propagates out of `tasks.create()` / `tasks.complete()` *after* the task was already persisted
  and its event published.
- **Triggers only fire through the internal bus.** Task auto-creation is driven by
  `workflow-transitioned` and `criterion-status-changed` events. An operation that changes state
  without emitting those (or a custom `MessageBus` used *instead of* the composite wiring) will
  not create triggered tasks.
- **Trigger matching and `create` can disagree about the config.** Triggers match against
  `configRegistry.current()` (latest) but `tasks.create()` validates against the case's pinned
  `configVersion`. For a case on an older config version, a task definition added only in the
  latest config will match a trigger and then fail in `create` with `ConfigurationError`.
- **De-duplication counts cancelled tasks as absent.** Because the check only looks for `open`
  or `completed`, cancelling a triggered task lets the same trigger recreate it next time it
  fires.
