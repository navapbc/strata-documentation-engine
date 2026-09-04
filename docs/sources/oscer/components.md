---
id: example-oscer-components
title: OSCER — SDK view components
source: oscer
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
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/components/certification_cases/case_row_component.rb
    - reporting-app/app/components/staff/task_row_component.rb
    - reporting-app/app/views/certification_cases/index.html.erb
    - reporting-app/app/views/certification_cases/show.html.erb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/controllers/certification_cases_controller.rb
    - reporting-app/app/helpers/application_helper.rb
    - reporting-app/app/helpers/activities_helper.rb
last_documented: 2026-09-04
verified: ok
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

  # Override default behavior to show the case number from the
  # certification request rather than the case.id UUID
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
(`name`, `case_no`, `step`) that the SDK base component calls per row. `step` reads the SDK's
`business_process_instance.current_step` off the case and translates it, so the component's i18n keys
have to track the business process's step names (see [business process](./business-process.md)).

## Subclassing a task-row component

`Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent`
(`app/components/staff/task_row_component.rb`) conditionally adds a `:confidence` column (gated on a
feature flag) and overrides the SDK hooks for the header label, cell classes, and row classes. Note
its `initialize` accepts an extra keyword and forwards the rest to `super`, which is how the SDK
component takes app-supplied options. It also mixes in the app's own `ActivitiesHelper`, and its
protected `confidence` cell method renders through that helper's `confidence_value_content`:

```ruby
class Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent
  include ActivitiesHelper

  def initialize(task:, confidence_by_case: nil, **kwargs)
    @confidence_by_case = confidence_by_case
    super(task: task, **kwargs)
  end

  def self.columns
    cols = super
    return cols unless Features.doc_ai_enabled?
    cols + [ :confidence ]
  end

  def self.header_translation_for(column)
    return I18n.t("staff.tasks.index.confidence") if column == :confidence
    super
  end

  def row_classes
    return nil unless Features.doc_ai_enabled?
    tc = task_confidence(@task.case_id, @confidence_by_case)
    "bg-error-lighter" if tc[:low]
  end

  protected

  def confidence
    tc = task_confidence(@task.case_id, @confidence_by_case)
    helpers.confidence_value_content(tc[:conf])
  end
  # ... cell_classes override
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

The controller defines `tasks_index_locals` itself, with a comment noting it does so to cover all
gem versions (it was added to the SDK alongside `TaskRowComponent`).

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
(`time_since_epoch`, `local_en_us`, etc.) resolve them (`app/helpers/application_helper.rb` — the
comment notes this also makes `render_inline` work in ViewComponent tests, which use
`ApplicationHelper` as the view context), and `CertificationCasesController` declares
`helper Strata::DateHelper` for the same reason. This shows the component surface depends on the
SDK's helper module being available in the app's view context.
