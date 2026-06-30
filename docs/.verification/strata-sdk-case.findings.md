# Verification findings: strata-sdk-case (round 1)

Doc: `docs/sources/strata-sdk/strata-sdk-case.md`
Source: `.sources/strata-sdk`

## Method

Independently re-read the three source files declared in the doc's `source_ref`:

- `app/models/strata/case.rb`
- `app/models/strata/business_process_instance.rb`
- `docs/case-management-business-process.md`

Plus cross-checked supporting claims against:

- `app/models/strata/application_form.rb` (the `<AppForm>Created` event)
- `app/models/strata/business_process_builder.rb` (`start_on_application_form_created`,
  `start_step_name`)
- `app/models/strata/business_process.rb` (`steps`, `case_class`)
- `app/models/strata/staff_task.rb` (the `Strata::StaffTask` step type used by `actionable`)

## Claims verified as accurate

- `Strata::Case` is `abstract_class = true` (case.rb:19-20). OK.
- `business_process` derives via `"Case"` -> `"BusinessProcess"` and `.constantize`s, returning a
  Class (case.rb:42-44). OK.
- `application_form_class` derives via `"Case"` -> `"ApplicationForm"` and returns a **String**
  (no `.constantize`; explicit comment that callers constantize downstream) (case.rb:48-52). The
  doc now states this asymmetry correctly (doc lines 31-35) — the round-1 low finding has been
  incorporated. OK.
- Attributes: `application_form_id` (uuid) case.rb:64; `status` enum `open: 0` default / `closed: 1`,
  writer `protected` case.rb:66-68; `business_process_current_step` (string) case.rb:70;
  `facts` (jsonb, default `{}`) case.rb:71. OK.
- `has_many :tasks, as: :case, class_name: "Strata::Task"` (case.rb:22). OK.
- `close`/`close!` set status to closed; `reopen`/`reopen!` set to open (case.rb:93-124). OK.
- `business_process_instance` returns a `BusinessProcessInstance` (case.rb:126-128). OK. (Note:
  `BusinessProcessInstance#initialize` ignores its `current_step` arg and `current_step` reads from
  the case column — but the doc's observable description "for the current step" holds.)
- `create_task(task_class, **attributes)` raises `ArgumentError` unless `task_class <= Strata::Task`
  (case.rb:136-140). OK.
- `migrate_business_process_current_step` bulk-renames via `update_all`, returns rows updated
  (case.rb:60-63). OK.
- `actionable` scope selects steps that are `Strata::StaffTask` from the process definition
  (case.rb:25-28; staff_task.rb defines `Strata::StaffTask`). OK.
- `for_application_form` (case.rb:74). OK.
- `for_event` raises `ArgumentError` if the present key is nil, returns `none` if neither key present
  (case.rb:75-88). OK.
- `default_scope { includes(:tasks) }` (case.rb:73). OK.
- `base_attributes_for_generator` lists the four columns exactly as quoted (case.rb:33-40). OK.
- Gotcha: a transition to `"end"` closes the case automatically
  (business_process_instance.rb:74-76). OK.
- Minimal-usage comment that cases are created from an `<AppForm>Created` event — supported by
  application_form.rb:103 (`"#{self.class.name}Created"`) + business_process_builder.rb:57-58
  (`"#{case_class.application_form_class}Created"`). OK.
- `kase.business_process_instance.current_step # => "submit_application"` — matches the source's own
  example in case-management-business-process.md. OK.

## Findings

None. The doc is fully supported by the source. The single low-severity round-1 finding
(`application_form_class` return type) has already been resolved in the current doc text.
