---
id: strata-sdk-form-flows
title: Multi-page form flows
source: strata-sdk
doc_type: feature
tags: [strata-sdk, form-flow, multi-page, dsl, routes]
related:
  - strata-sdk-application-form
  - strata-sdk-form-builder
  - strata-sdk-generators
feature_keys:
  - application-form-flow
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::Flows::ApplicationFormFlow DSL for defining multi-page forms with auto-generated routes, controller actions, and validation contexts.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/flows/application_form_flow.rb
    - app/models/strata/flows/application_form_controller.rb
    - app/models/strata/flows/application_form_validations.rb
    - app/models/strata/flows/question_page.rb
    - app/models/strata/flows/task_evaluator.rb
    - docs/multi-page-form-flows.md
verified: ok
last_documented: 2026-06-29
---

# Multi-page form flows

Multi-page form flows define complex forms that span multiple pages, following government
application design patterns (one question per page, task lists, looping). The DSL lives in
`Strata::Flows::ApplicationFormFlow` (`app/models/strata/flows/application_form_flow.rb`).

## Defining a flow

Include the concern and declare `task` blocks containing `question_page`s:

```ruby
class LeaveApplicationFormFlow
  include Strata::Flows::ApplicationFormFlow

  task :personal_information do
    question_page :name, fields: [:applicant_name_first, :applicant_name_last]
    question_page :date_of_birth
    question_page :tax_identifier
  end

  task :leave_details do
    question_page :leave_type
    question_page :supporting_documents, if: ->(record) { record.leave_type_medical? }
  end
end
```

- `task(task_name, depends_on: nil, &block)` declares an ordered task (a task-list section).
  `depends_on` may name other tasks (or `:all`); it is validated against existing task names
  (`validate_depends_on!` raises `ArgumentError` on unknown names).
- `question_page(page_name, if: nil, fields: nil)` declares a page. With no `fields`, the page is
  assumed to have a single field named after the page. `fields` may include nested-attribute hashes
  for `assign_attributes`. The `if:` lambda marks the page as conditionally needed —
  `prev_path`/`next_path` skip it during navigation when the lambda returns false. Each page name
  becomes a **validation context**.
- `start_page(path)` / `end_page(path)` set the entry/exit paths (each may be set only once).

Useful class methods: `pages` (all pages across tasks), `generated_routes` (the edit/update path
pairs to register), and `to_mermaid` (renders the flow as a Mermaid diagram). Instances expose
`completed?`, `task_counter(task)`, `dependencies_met?`, `start_path`, and `end_path`.

## Wiring routes and a controller

Include `Strata::Flows::ApplicationFormController`, call `flow YourFlow`, and define `flow_record`:

```ruby
class LeaveApplicationFormsController
  include Strata::Flows::ApplicationFormController
  flow Flows::LeaveApplicationFormFlow

  def flow_record
    @leave_application
  end
end
```

In `routes.rb`, iterate the flow's pages to register `get page.edit_pathname` /
`patch page.update_pathname` inside the resource's `member` block.

## Views and instance variables

Generate views with `bin/rails generate strata:application_form_views FlowClass FormClass`; a view
must exist for each question page. Controller actions expose:

| Variable | Class | Use |
| --- | --- | --- |
| `@flow` | `ApplicationFormFlow` | `task_counter`, `start_path`, `end_path` |
| `@flow_page` | `QuestionPage` | validation context (`name`), completion state |
| `@flow_task` | `TaskEvaluator` | `update_path`, `prev_path`, `next_path` |

A `TaskListComponent` renders task-list status:
`render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true)`.

## Validations

Each page runs validation under its own context (the `name` page runs `:name`). Include
`Strata::Flows::ApplicationFormValidations` and call `validate_flow YourFlow` to generate a `Flow`
constants module of contexts you can reference:

```ruby
class LeaveApplicationForm < ActiveRecord::Base
  include Strata::Flows::ApplicationFormValidations
  validate_flow LeaveApplicationFormFlow

  validates :applicant_name_first, presence: true, on: Flow::NAME
end
```

By default all generated contexts are validated on submit (the `:submit` context run by
`ApplicationForm#submit_application`); disable with `validate_flow YourFlow, validate_on_submit: false`.

## Gotchas

- Some capabilities (built-in progress views, the looping pattern) are marked **FUTURE** in the SDK
  doc — don't rely on them yet.
- The flow class includes `Rails.application.routes.url_helpers`, so path helpers (e.g.
  `start_path`/`end_path`) depend on the host app's routes being defined.
