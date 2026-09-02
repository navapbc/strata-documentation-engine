---
id: example-oscer-components
title: OSCER — SDK view components
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, components, view-component, uswds]
related:
  - example-oscer-overview
  - example-oscer-tasks
  - example-oscer-business-process
demonstrates: [components]
summary: How OSCER extends the SDK's ViewComponents (case-row, task-row, index, accordion) and its DateHelper to render caseworker case and task views.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/components/certification_cases/case_row_component.rb
    - reporting-app/app/components/staff/task_row_component.rb
    - reporting-app/app/views/certification_cases/index.html.erb
    - reporting-app/app/views/certification_cases/show.html.erb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/helpers/application_helper.rb
last_documented: 2026-07-21
---

# OSCER — SDK view components

OSCER renders its caseworker case and task views on the SDK's ViewComponent surface, both by
**subclassing** the SDK's row components (to add app columns) and by **rendering** the SDK's index
and layout components directly.

## Subclassing a case-row component

`CertificationCases::CaseRowComponent < Strata::Cases::CaseRowComponent`
(`app/components/certification_cases/case_row_component.rb`) prepends a `:name` column to the SDK's
default columns and overrides cell renderers for app-specific data:

```ruby
class CertificationCases::CaseRowComponent < Strata::Cases::CaseRowComponent
  def self.columns
    [ :name ] + super
  end

  protected

  def name
    link_to @case.certification.member_name&.full_name, member_path(@case.certification.member_id)
  end

  # Show the certification's case number rather than the case.id UUID
  def case_no
    link_to @case.certification.case_number, certification_case_path(@case)
  end

  def step
    step_name = @case.business_process_instance.current_step
    t(".steps.#{step_name}")
  end
end
```

The subclass extends `self.columns` with `super`, and overrides protected cell methods
(`name`, `case_no`, `step`) that the SDK base component calls per row.

## Subclassing a task-row component

`Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent`
(`app/components/staff/task_row_component.rb`) conditionally adds a `:confidence` column (gated on a
feature flag) and overrides the SDK hooks for the header label, cell classes, and row classes:

```ruby
class Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent
  def self.columns
    cols = super
    return cols unless Features.doc_ai_enabled?
    cols + [ :confidence ]
  end

  def self.header_translation_for(column)
    return I18n.t("staff.tasks.index.confidence") if column == :confidence
    super
  end
  # ... row_classes / cell_classes overrides
end
```

`TasksController` wires this component into the SDK's task index by passing it through the render
locals (`app/controllers/tasks_controller.rb`):

```ruby
render "strata/tasks/index", locals: tasks_index_locals
# tasks_index_locals sets:
#   task_row_component_class: Staff::TaskRowComponent,
#   task_row_component_options: { confidence_by_case: @confidence_by_case }
```

## Rendering SDK components directly

The case index and show views render SDK components without subclassing. The index view renders
`Strata::Cases::IndexComponent`, injecting the app's row component
(`app/views/certification_cases/index.html.erb`):

```erb
<%= render Strata::Cases::IndexComponent.new(
  model_class: CertificationCase,
  cases: @cases,
  title: t(".title"),
  case_row_component_class: CertificationCases::CaseRowComponent
) %>
```

The case show view uses the SDK's USWDS accordion component with slot blocks
(`app/views/certification_cases/show.html.erb`):

```erb
<%= render Strata::US::AccordionComponent.new(heading_tag: :h4, is_bordered: true, is_multiselectable: true) do |component| %>
  <% component.with_heading { t(".certification_details") } %>
  <% component.with_body do %> ... <% end %>
<% end %>
```

It also renders the SDK breadcrumbs partial (`render partial: "strata/shared/breadcrumbs", ...`).

## SDK helper mix-ins

`ApplicationHelper` mixes in `Strata::DateHelper` so SDK components that call helper methods
(`time_since_epoch`, `local_en_us`, etc.) resolve them (`app/helpers/application_helper.rb`), and
`CertificationCasesController` declares `helper Strata::DateHelper` for the same reason. This shows
the component surface depends on the SDK's helper module being available in the app's view context.
