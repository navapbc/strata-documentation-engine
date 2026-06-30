# Verification findings: strata-sdk-form-flows

- Doc: `docs/sources/strata-sdk/strata-sdk-form-flows.md`
- Source checkout: `.sources/strata-sdk`
- Round: 1

## Summary

Verified the doc against the source. Every claim is supported by the source:

- DSL lives in `Strata::Flows::ApplicationFormFlow` (`app/models/strata/flows/application_form_flow.rb:19`).
- `task(task_name, depends_on: nil, &block)` declares an ordered task; `depends_on` may name other
  tasks or `:all`, validated by `validate_depends_on!` which raises `ArgumentError` on unknown names
  (`application_form_flow.rb:50-68`, `:181-191` for `:all` handling).
- `question_page(page_name, if: nil, fields: nil)` defaults `fields` to a single field named after
  the page (`application_form_flow.rb:73-77`; `question_page.rb:9-15`). `fields` may include
  nested-attribute hashes for `assign_attributes` (`docs/multi-page-form-flows.md:79-89`).
- Each page name is pushed into `contexts`, becoming a validation context
  (`application_form_flow.rb:76`); `QuestionPage#completed?` runs `record.valid?(@name)`
  (`question_page.rb:21-23`).
- `if:` lambda stored as `@if`, consumed by `QuestionPage#needed?`, which `TaskEvaluator#prev_path`/
  `#next_path` use to skip pages during navigation (`question_page.rb:17-19`,
  `task_evaluator.rb:34-60`).
- `start_page(path)` / `end_page(path)` each raise if set twice (`application_form_flow.rb:81-97`).
- Class methods `pages`, `generated_routes`, `to_mermaid` (renders `flowchart TD` Mermaid) exist
  (`application_form_flow.rb:37-47, 112-151`); instance methods `completed?`, `task_counter(task)`,
  `dependencies_met?`, `start_path`, `end_path` exist (`application_form_flow.rb:162-205`).
- Controller wiring: include `Strata::Flows::ApplicationFormController`, call `flow YourFlow`, define
  `flow_record` (`application_form_controller.rb:19-27`); `routes.rb` iterates pages registering
  `get page.edit_pathname` / `patch page.update_pathname` inside `member` (matches source doc
  `docs/multi-page-form-flows.md:119-130`).
- Instance variables `@flow` (ApplicationFormFlow: `task_counter`, `start_path`, `end_path`),
  `@flow_page` (QuestionPage: `name` context, completion state), `@flow_task` (TaskEvaluator:
  `update_path`, `prev_path`, `next_path`) — set by `set_flow`/`set_flow_task`
  (`application_form_controller.rb:34-40`; `task_evaluator.rb:34-60`; `question_page.rb`).
- `TaskListComponent.new(flow:, show_step_label:)` is a real constructor
  (`task_list_component.rb:16-24`).
- Views generated via `bin/rails generate strata:application_form_views FlowClass FormClass`, one
  `edit_<page>.html.erb` per question page (`application_form_views_generator.rb:14-39, 59-65`).
- Validations: include `Strata::Flows::ApplicationFormValidations`, call `validate_flow YourFlow`,
  reference contexts via the `Flow` constants module; default auto-validates all contexts on
  `:submit`, disabled with `validate_on_submit: false` (`application_form_validations.rb:9-33`). The
  `:submit` context is run by `ApplicationForm#submit_application` via `valid?(:submit)`
  (`application_form.rb:64-66`).
- "FUTURE" caveats (built-in progress views, looping pattern) match the SDK doc's `[FUTURE]` markers
  (`docs/multi-page-form-flows.md:11-12`).
- Flow class includes `Rails.application.routes.url_helpers`, so path helpers depend on host-app
  routes (`application_form_flow.rb:21`).

## Findings

No remaining findings. The doc is fully supported by the source.
