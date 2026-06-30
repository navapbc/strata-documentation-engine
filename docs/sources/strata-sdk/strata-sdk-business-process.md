---
id: strata-sdk-business-process
title: Business processes
source: strata-sdk
doc_type: feature
tags: [strata-sdk, business-process, workflow, events]
related:
  - strata-sdk-case
  - strata-sdk-tasks
  - strata-sdk-application-form
  - strata-sdk-generators
feature_keys:
  - business-process
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::BusinessProcess DSL for defining event-driven workflows of steps and transitions over a Case.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/business_process.rb
    - app/models/strata/business_process_builder.rb
    - docs/case-management-business-process.md
    - docs/business-process-family-tree.md
    - docs/strata-sdk-components.md
verified: ok
last_documented: 2026-06-29
---

# Business processes

`Strata::BusinessProcess` (`app/models/strata/business_process.rb`) defines an event-driven
workflow of **steps** and **transitions** for a `Strata::Case`. A process is declared as a subclass
(convention: `app/business_processes/<name>_business_process.rb`, e.g.
`PassportBusinessProcess`). Naming is convention-driven: `case_class` derives the case class by
substituting `"BusinessProcess"` → `"Case"` in the class name.

## Defining a process

The builder DSL (`Strata::BusinessProcessBuilder`, mixed in) provides class-level methods:

| Method | Adds |
| --- | --- |
| `applicant_task(name)` | a step that creates a `Strata::ApplicantTask` |
| `staff_task(name, task_class)` | a step that creates a `Strata::StaffTask` wired to `Strata::TaskService.get` |
| `system_process(name, callable)` | a step that runs a `Strata::SystemProcess` callback |
| `third_party_task(name)` | a step that creates a `Strata::ThirdPartyTask` |
| `step(name, step)` | adds an arbitrary step object |
| `start(step_name, on: nil, &handler)` | sets the start step (and start event/handler) |
| `start_on_application_form_created(step_name)` | starts when `<AppForm>Created` fires |
| `transition(from, event_name, to)` | wires an event from one step to the next |

```ruby
class PassportBusinessProcess < Strata::BusinessProcess
  applicant_task("submit_application")
  system_process("verify_identity", ->(kase) { IdentityVerificationService.new(kase).verify_identity })
  staff_task("review_application", PassportTask)

  start_on_application_form_created("submit_application")

  transition("submit_application", "PassportApplicationFormSubmitted", "verify_identity")
  transition("verify_identity", "IdentityVerified", "review_application")
  transition("review_application", "DecisionMade", "end")
end
```

The source docstrings (`business_process.rb`, `business_process_builder.rb`) and
`strata-sdk-components.md` also reference a `Strata::BusinessProcess.define(name, case_class) { |bp| ... }`
block form, but no `define` method is implemented anywhere in the SDK (it appears only in `@method`
docstrings and comments). The working usage is the subclass form shown above.

## Runtime behavior

- `start_listening_for_events` subscribes (via `Strata::EventManager.subscribe`) to every event
  named in transitions plus every start event. It must be called explicitly (the SDK's own spec
  calls it in a `before` block); the docstring's claim that `define` starts listening automatically
  describes the unimplemented `define` form, not the actual code. `stop_listening_for_events`
  unsubscribes (useful in tests). Listening is idempotent.
- On a **start event**, `create_case_from_event` runs the registered start handler to build and
  `save!` a case, then `business_process_instance.start_from_event(event)`. The default
  application-form-created handler builds a case with the event's `application_form_id`.
- On a non-start event, `case_class.for_event(event)` finds matching cases and calls
  `transition_to_next_step(event)` on each instance.
- Event payloads must carry either `case_id` or `application_form_id` to identify the case.
- Transitioning a step to `"end"` closes the case.
- `to_mermaid` renders the step/transition graph as a Mermaid `flowchart`, color-coded per step
  type (ApplicantTask green, StaffTask orange, SystemProcess blue, ThirdPartyTask lavender).

## Family tree

Business processes are designed to inherit: a foundational government-service process
(Intake → Verification → Decision → Appeal) is specialized per program (licensing, benefits) and
then per state, and subprocesses like "verify identity" have their own family trees
(`docs/business-process-family-tree.md`).

## Gotchas

- Transition `event_name`s are **string event names**, not method names — e.g. the
  `<ConcreteApplicationForm>Submitted` string published by `ApplicationForm#submit_application`.
- Class-name conventions are load-bearing: a `FooBusinessProcess` expects a `FooCase` and a
  `FooApplicationForm` unless overridden.
