# Verification findings: oscer-components (round 1)

Doc: `docs/sources/oscer/components.md`
Source checkout: `.sources/oscer`

## Result: no findings

Every claim in the doc is supported by the source checkout.

## Confirmed accurate against the source

- `CertificationCases::CaseRowComponent < Strata::Cases::CaseRowComponent`, prepends `:name` via
  `[ :name ] + super`, `protected` cell renderers `name` / `case_no` / `step` — matches
  `reporting-app/app/components/certification_cases/case_row_component.rb:1-24` (the doc code block
  on lines 32-54 is verbatim, including the two-line `case_no` comment at source lines 14-15).
- `case_no` overrides to show the certification case number instead of the `case.id` UUID; `step`
  reads `@case.business_process_instance.current_step` and renders `t(".steps.#{step_name}")` —
  matches source lines 16-23.
- Rendered via `Strata::Cases::IndexComponent` with `case_row_component_class:
  CertificationCases::CaseRowComponent` — matches
  `reporting-app/app/views/certification_cases/index.html.erb:1-6`. The doc's `...` snippet is an
  explicitly elided form.
- `Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent`; conditional `:confidence` column
  gated on `Features.doc_ai_enabled?`; `header_translation_for` returns the confidence I18n string
  else `super`; `row_classes` is a full override (no `super`) returning `"bg-error-lighter"` when
  `tc[:low]` else `nil` — matches `reporting-app/app/components/staff/task_row_component.rb:11-26`.
- Doc's claim that `cell_classes` composes via `super` is accurate — source lines 35-38 return a
  custom class for `:confidence` else `super`.
- `ApplicationHelper include Strata::DateHelper` with the verbatim comment about
  `time_since_epoch` / `local_en_us` — matches `reporting-app/app/helpers/application_helper.rb:3-6`.
- `CertificationCasesController` registers `helper Strata::DateHelper` —
  `reporting-app/app/controllers/certification_cases_controller.rb:4`.

## Findings

None. The doc is fully supported by the source.
