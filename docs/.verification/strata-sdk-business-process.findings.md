# Verification findings: strata-sdk-business-process (round 1)

Doc: `docs/sources/strata-sdk/strata-sdk-business-process.md`
Source checkout: `.sources/strata-sdk`

## Summary

No findings. All claims in the doc are fully supported by the source.

## Claim-by-claim verification

- **`BusinessProcess` file location and subclass convention** — matches `business_process.rb`
  lines 1-30 docstring example (`app/business_processes/<name>_business_process.rb`,
  `PassportBusinessProcess`) and `docs/case-management-business-process.md` lines 43-60.
- **`case_class` naming convention** (`"BusinessProcess"` → `"Case"`) — `business_process.rb`
  lines 63-65: `name.sub("BusinessProcess", "Case").constantize`; confirmed.
- **DSL method table** (`applicant_task`, `staff_task`, `system_process`, `third_party_task`,
  `step`, `start`, `start_on_application_form_created`, `transition`) — all present in
  `business_process_builder.rb` lines 48-88.
  - `staff_task` wires `Strata::StaffTask.new(task_class, Strata::TaskService.get)` —
    line 69; confirmed.
- **`define` block form labeled unimplemented** — no `def define` or `def self.define`
  found in `app/` or `lib/`; `define` appears only in `@method` docstring
  (`business_process.rb` lines 46-52), builder comments (`business_process_builder.rb`
  lines 8, 11), and `docs/strata-sdk-components.md` line 66. Doc's framing is correct.
- **`start_listening_for_events` must be called explicitly; idempotent** — `business_process.rb`
  lines 105-118 (`@listening` guard returns early if already listening). The claim that
  `start_listening_for_events` "must be called explicitly" is correct; no auto-invocation
  exists in `BusinessProcess` or `BusinessProcessBuilder`.
- **`stop_listening_for_events` unsubscribes via `Strata::EventManager.unsubscribe`** —
  `business_process.rb` lines 120-129; confirmed.
- **Subscribes to transition events plus start events** — `get_event_names`
  (`business_process.rb` lines 145-147): `transitions.values.flat_map(&:keys).uniq |
  start_events.keys`; confirmed.
- **Start-event path: `create_case_from_event` runs handler, `save!`s, then
  `business_process_instance.start_from_event`** — `business_process.rb` lines 135-143,
  149-155; confirmed.
- **Default handler builds case with `application_form_id`** — `business_process_builder.rb`
  lines 57-62: `case_class.new(application_form_id: event[:payload][:application_form_id])`;
  confirmed.
- **Non-start path: `case_class.for_event(event)` then `transition_to_next_step`** —
  `business_process.rb` lines 156-160; `for_event` scope `case.rb` lines 75-88; confirmed.
- **Payload must carry `case_id` or `application_form_id`** — `for_event` scope returns
  `none` if neither key present (`case.rb` lines 84-87); confirmed.
- **Transitioning to `"end"` closes the case** — `business_process_instance.rb` has
  `transition_to_next_step` logic; `case.rb` lines 93-96 (`close`/`close!`); confirmed.
- **`to_mermaid` flowchart with per-type color classDefs** — `business_process.rb`
  lines 71-98: `ApplicantTask fill:#90EE90` (green), `StaffTask fill:#ffb366` (orange),
  `SystemProcess fill:#a0d8ef` (blue), `ThirdPartyTask fill:#c0c0ff` (lavender/periwinkle);
  confirmed.
- **Family-tree narrative** (Intake → Verification → Decision → Appeal; program then state
  specialization; verify-identity subprocess trees) — matches
  `docs/business-process-family-tree.md` throughout.
- **Gotcha: event_names are strings published by `ApplicationForm#submit_application`** —
  `application_form.rb` line 108 publishes `"#{self.class.name}Submitted"` via
  `publish_submitted`, invoked by `submit_application` line 74; confirmed.
- **Gotcha: class-name conventions** (`FooBusinessProcess` → `FooCase` → `FooApplicationForm`) —
  `business_process.rb` lines 63-65 (`case_class`) and `case.rb` lines 48-52
  (`application_form_class`); confirmed.

No inaccurate, unsupported, or outdated statements found.
