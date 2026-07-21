---
id: example-strata-unemployment-flow
title: Unemployment benefits flow (Strata::Flows::ApplicationFormFlow)
source: strata-unemployment
doc_type: example
tags: [example-app, flow, tasks, question-pages]
related:
  - example-strata-unemployment-overview
  - example-strata-unemployment-application-form
  - example-strata-unemployment-components
demonstrates: [application-form-flow]
summary: How the unemployment portal declares a multi-task, multi-page intake flow with task/question_page/end_page and wires it to the controller.
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/flows/unemployment_benefits_flow.rb
    - unemployment/app/controllers/unemployment_benefits_application_forms_controller.rb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_identity.html.erb
verified: ok
last_documented: 2026-06-29
---

# Unemployment benefits flow

`UnemploymentBenefitsFlow` declares the page structure of the intake using the SDK's flow DSL:

```ruby
# app/flows/unemployment_benefits_flow.rb
class UnemploymentBenefitsFlow
  include Strata::Flows::ApplicationFormFlow

  task :screener do
    question_page :school_and_training, fields: [ :attending_school ]
    question_page :benefits, fields: [ :receiving_social_security, :receiving_workers_comp, :receiving_pension ]
    # ...
  end
  # ...
  end_page :review
end
```

## Tasks group pages

The flow is organized into five `task` blocks — `screener`, `personal_information`,
`employment_history`, `occupation_and_income`, and `dependents` — each grouping a set of
`question_page`s. A task is a named grouping the SDK uses to render the task list and step labels.

## Question pages declare their fields

Each `question_page` names the page and lists the fields it collects. Two field shapes appear:

- **Flat field lists** — `fields: [ :attending_school ]`.
- **Nested/compound fields** — a hash that maps a parent attribute to its sub-parts, e.g. the date
  of birth on the identity page:

```ruby
question_page :identity, fields: [
  :claimant_name_first, :claimant_name_middle, :claimant_name_last, :claimant_name_suffix,
  :claimant_ssn,
  :email,
  date_of_birth: [ :month, :day, :year ]
]
```

## End page

The flow terminates with `end_page :review`, the page where the claimant reviews answers before
submitting.

## Wiring the flow to model, controller, and routes

The flow is referenced from three places:

- **Model** — `validate_flow UnemploymentBenefitsFlow` ties page-scoped validations to it (see
  [application form](./application-form.md)).
- **Controller** — the controller mixes in `Strata::Flows::ApplicationFormController` and declares
  `flow UnemploymentBenefitsFlow`. The flow controller supplies `@flow` and `@flow_task` used by
  the edit views (e.g. `@flow_task.update_path`, `@flow_task.prev_path`, `@flow.start_path`).
- **Routes** — `config/routes.rb` iterates `UnemploymentBenefitsFlow.pages` to generate the
  per-page `edit`/`update` routes dynamically, so adding a page to the flow adds its routes.

The page constants referenced by the model's validations (`Flow::IDENTITY`, `Flow::CONTACT`, …)
correspond to the `question_page` names declared here.
