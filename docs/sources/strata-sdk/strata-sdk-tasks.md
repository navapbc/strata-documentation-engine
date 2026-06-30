---
id: strata-sdk-tasks
title: Tasks and process steps
source: strata-sdk
doc_type: feature
tags: [strata-sdk, task, step, business-process]
related:
  - strata-sdk-business-process
  - strata-sdk-case
  - strata-sdk-generators
feature_keys:
  - task
  - task/applicant-task
  - task/staff-task
  - task/system-process
  - task/third-party-task
  - concerns/step
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::Task ActiveRecord work item and the four Step types (applicant, staff, system, third-party) used inside business processes.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/task.rb
    - app/models/strata/applicant_task.rb
    - app/models/strata/staff_task.rb
    - app/models/strata/system_process.rb
    - app/models/strata/third_party_task.rb
    - app/models/concerns/strata/step.rb
    - docs/implementing-tasks-views.md
    - docs/case-management-business-process.md
verified: ok
last_documented: 2026-06-29
---

# Tasks and process steps

The SDK distinguishes two related concepts:

1. **`Strata::Task`** — the persisted ActiveRecord work item (a row in `strata_tasks`).
2. **Process steps** — `ApplicantTask`, `StaffTask`, `SystemProcess`, `ThirdPartyTask` — lightweight
   objects that implement the `Strata::Step` interface and are placed into a business process
   definition. These are **not** ActiveRecord models and do not subclass `Strata::Task`.

## `Strata::Task` (the work item)

`app/models/strata/task.rb` is the base for persisted tasks. Subclass it for concrete task types
(e.g. `PassportTask`).

- Attributes: `description` (text), `due_on` (date), `assignee_id` (uuid, `protected` writer),
  `status` enum (`pending: 0` default, `completed: 1`, `on_hold: 2`).
- `belongs_to :case, polymorphic: true` (required). `type`, `case_id`, `case_type`, `id` are
  `attr_readonly`.
- Assignment: `assign(user_id)` / `unassign`; class methods `next_unassigned` and
  `assign_next_task_to(user_id)` (wrapped in a transaction).
- Scopes: `due_today`, `due_tomorrow`, `due_this_week`, `overdue`, `completed`, `incomplete`,
  `unassigned`, `with_type`, `with_status`, `without_status`; `default_scope` preloads the case and
  orders by `due_on` ascending.
- On a status change it publishes `<TaskClass><Status>` (e.g. `PassportTaskCompleted`) via
  `Strata::EventManager.publish` with `{ task_id:, case_id: }` — these events can drive business
  process transitions.

## The `Strata::Step` interface

`Strata::Step` (`app/models/concerns/strata/step.rb`) is the common interface for process steps: it
requires an `execute(kase)` method (the default raises `NoMethodError`).

### `ApplicantTask`

`ApplicantTask.new(name)` — a step the applicant performs. `execute(kase)` logs execution. Added to
a process with `applicant_task(name)`.

### `StaffTask`

`StaffTask.new(task_class, task_management_service)` — a step requiring staff action. Its
constructor raises `ArgumentError` unless `task_class <= Strata::Task`. `execute(kase)` calls
`task_management_service.create_task(task_class, kase)`, creating a persisted `Strata::Task`. The
`staff_task(name, task_class)` DSL wires it to `Strata::TaskService.get`.

### `SystemProcess`

`SystemProcess.new(name, callback)` — an automated step. The constructor raises `ArgumentError`
unless `callback` responds to `:call`. `execute(kase)` invokes `callback.call(kase)`. Added with
`system_process(name, callable)`.

### `ThirdPartyTask`

`ThirdPartyTask.new(name)` — a step performed by an external party. `execute(kase)` logs execution.
Added with `third_party_task(name)`.

## Minimal usage

```ruby
class PassportTask < Strata::Task
end

# inside a business process definition:
staff_task("review_application", PassportTask)
```

## Gotchas

- Don't confuse the AR `Strata::Task` (and its subclasses) with the step classes. Only `StaffTask`
  materializes a `Strata::Task` row; `ApplicantTask`/`ThirdPartyTask` `execute` only log, and
  `SystemProcess` just runs its callback.
- `assignee_id` is not freely writable from outside — use `assign`/`unassign`. `status` exposes
  public setters (`status=`, `pending!`, `completed!`, `on_hold!`); the status-change event fires
  only when `status` actually changes (guarded by `saved_change_to_status?`).
