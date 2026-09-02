# Verification findings: example-oscer-components (round 1)

Doc: `docs/sources/oscer/components.md`
Source: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750` (matches `source_ref.ref`)

## Result

No findings. Every claim in the doc is supported by the source.

## Claims checked

- `CertificationCases::CaseRowComponent < Strata::Cases::CaseRowComponent`, prepends `:name`
  via `[ :name ] + super`, overrides `name`, `case_no`, `step` — matches
  `reporting-app/app/components/certification_cases/case_row_component.rb:3-24`. Code block is
  a faithful (near-verbatim) reproduction.
- `Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent` conditionally adds `:confidence`
  gated on `Features.doc_ai_enabled?`, overrides `header_translation_for`, `row_classes`,
  `cell_classes` — matches `reporting-app/app/components/staff/task_row_component.rb:3-39`.
  The abbreviated code block (`# ... row_classes / cell_classes overrides`) omits nothing it
  claims to show.
- `TasksController` renders `"strata/tasks/index"` with `tasks_index_locals` setting
  `task_row_component_class: Staff::TaskRowComponent` and
  `task_row_component_options: { confidence_by_case: @confidence_by_case }` — matches
  `reporting-app/app/controllers/tasks_controller.rb:26, 97-105`.
- Index view renders `Strata::Cases::IndexComponent.new(...)` injecting
  `case_row_component_class: CertificationCases::CaseRowComponent` — matches
  `reporting-app/app/views/certification_cases/index.html.erb:1-6`.
- Show view renders `Strata::US::AccordionComponent.new(heading_tag: :h4, is_bordered: true,
  is_multiselectable: true)` with `with_heading` / `with_body` slots — matches
  `reporting-app/app/views/certification_cases/show.html.erb:23-25`.
- Show view renders the SDK breadcrumbs partial `"strata/shared/breadcrumbs"` — matches
  `show.html.erb:3`.
- `ApplicationHelper` includes `Strata::DateHelper`; SDK components call `time_since_epoch` /
  `local_en_us` — matches `reporting-app/app/helpers/application_helper.rb:4-6`.
- `CertificationCasesController` declares `helper Strata::DateHelper` — confirmed at
  `reporting-app/app/controllers/certification_cases_controller.rb:4` (file not in
  `source_ref.paths` but claim is accurate).
