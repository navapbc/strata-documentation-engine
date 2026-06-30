---
id: strata-sdk-case
title: Cases
source: strata-sdk
doc_type: feature
tags: [strata-sdk, case, workflow, case-management]
related:
  - strata-sdk-business-process
  - strata-sdk-tasks
  - strata-sdk-application-form
  - strata-sdk-generators
feature_keys:
  - case
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The abstract Strata::Case model that tracks a business process instance's current step, status, and tasks.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/case.rb
    - app/models/strata/business_process_instance.rb
    - docs/case-management-business-process.md
verified: ok
last_documented: 2026-06-29
---

# Cases

`Strata::Case` (`app/models/strata/case.rb`) is the abstract base (`abstract_class = true`) for
case models that track an in-flight business process. Subclass it (e.g. `PassportCase`); by
convention `business_process` derives and constantizes the process class via `"Case"` →
`"BusinessProcess"` (returning a `Class`), whereas `application_form_class` derives the form via
`"Case"` → `"ApplicationForm"` but returns it as a `String` — it is not constantized, so callers
must constantize it downstream.

## Public surface

- Attributes: `application_form_id` (uuid), `status` enum (`open: 0` default, `closed: 1`; writer
  is `protected`), `business_process_current_step` (string), `facts` (jsonb, default `{}`).
- `has_many :tasks, as: :case, class_name: "Strata::Task"`.
- Lifecycle: `close` / `close!` set status to `closed`; `reopen` / `reopen!` set it back to `open`.
- `business_process_instance` returns a `BusinessProcessInstance` for the current step.
- `create_task(task_class, **attributes)` creates a task tied to this case (raises `ArgumentError`
  unless `task_class <= Strata::Task`).
- `self.migrate_business_process_current_step(from_step_name:, to_step_name:)` bulk-renames the
  current step across cases (returns the number of rows updated) — useful when renaming a step in a
  deployed process.

## Scopes

- `actionable` — cases whose current step is a `Strata::StaffTask` step (derived from the process
  definition).
- `for_application_form(application_form_id)` — cases for a given form.
- `for_event(event)` — resolves cases from an event payload by `case_id` or `application_form_id`
  (raises `ArgumentError` if the present key is nil; returns `none` if neither key is present).
- A `default_scope { includes(:tasks) }` eager-loads tasks.

## Generator base attributes

`base_attributes_for_generator` lists the columns generators add to a case migration:
`application_form_id:uuid`, `status:integer`, `business_process_current_step:string`, `facts:jsonb`.

## Minimal usage

```ruby
class PassportCase < Strata::Case
  # add custom attributes/associations as needed
end

# Cases are normally created by the business process engine from an
# <AppForm>Created event, then advanced via transitions:
kase = PassportCase.find_by(application_form_id: form.id)
kase.business_process_instance.current_step   # => "submit_application"
```

## Gotchas

- `status` has no public writer — use `close`/`reopen`. A step transition to `"end"` closes the
  case automatically.
- `actionable` reads the associated business process's step definitions, so it depends on the
  `FooCase` ↔ `FooBusinessProcess` naming convention holding.
