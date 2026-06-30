# Verification findings: example-strata-unemployment-flow (round 1)

Doc: `docs/sources/strata-unemployment/flow.md`
Source: `.sources/strata-unemployment`

## Result: no findings

Every claim in the doc is supported by the source:

- Flow class, `include Strata::Flows::ApplicationFormFlow`, the five tasks
  (`screener`, `personal_information`, `employment_history`, `occupation_and_income`,
  `dependents`), the `question_page` declarations, the nested `date_of_birth: [:month, :day, :year]`
  field, and `end_page :review` all match
  `unemployment/app/flows/unemployment_benefits_flow.rb` exactly.
- Controller mixes in `Strata::Flows::ApplicationFormController` and declares
  `flow UnemploymentBenefitsFlow`
  (`unemployment/app/controllers/unemployment_benefits_application_forms_controller.rb`).
- Routes iterate `UnemploymentBenefitsFlow.pages` to generate per-page routes
  (`unemployment/config/routes.rb`).
- Model declares `validate_flow UnemploymentBenefitsFlow` and uses page-scoped
  constants `Flow::IDENTITY` / `Flow::CONTACT`
  (`unemployment/app/models/unemployment_benefits_application_form.rb`).
- The edit view uses `@flow_task.update_path`, `@flow_task.prev_path`, and
  `@flow.start_path`
  (`unemployment/app/views/unemployment_benefits_application_forms/edit_identity.html.erb`).

The doc is fully supported by the source.
