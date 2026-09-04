---
id: example-strata-paidleave-components
title: SDK ViewComponents in the paid leave UI
source: strata-paidleave
doc_type: example
tags: [example-app, components, uswds, view-components]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-cases-and-tasks
  - example-strata-paidleave-flows
  - example-strata-paidleave-form-builder
demonstrates:
  - components
summary: Which Strata ViewComponents the paid leave app renders — USWDS primitives, the flow task list, the case index — and how it subclasses the case-row and task-row components to define its own staff table columns.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/components/leave_application_case_row_component.rb
    - paidleave/app/components/task_row_component.rb
    - paidleave/app/views/leave_application_cases/index.html.erb
    - paidleave/app/views/leave_applications/show.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/index.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/overview.html.erb
    - paidleave/app/views/employers/contribution_payment_forms/_form_buttons.html.erb
    - paidleave/app/views/employers/contribution_payment_forms/ach_credit_instructions.html.erb
    - paidleave/app/views/employers/contribution_payment_forms/show.html.erb
    - paidleave/app/components/tag_component.rb
    - paidleave/app/components/accordion_component.rb
    - paidleave/app/components/documents/file_table_component.html.erb
    - paidleave/app/views/application/_upload_document_modal.html.erb
    - paidleave/app/models/quarterly_wage_report_form.rb
    - paidleave/app/controllers/employers/quarterly_wage_report_forms_controller.rb
    - docs/paidleave/lookbook.md
last_documented: 2026-09-04
verified: ok
---

# SDK ViewComponents in the paid leave UI

## What the app renders

| Component | Options used | Slots used |
|---|---|---|
| `Strata::US::AlertComponent` | `type: :info` / `:warning`, `slim:`, `classes:`, `heading_tag:` | `with_heading`, `with_body` |
| `Strata::US::ButtonComponent` | `variant: :outline` / `:unstyled`, `type: :submit`, `classes:`, `data:`, `aria:`; also `.css_classes` as a class method | block content |
| `Strata::US::ButtonGroupComponent` | `classes:` | `with_item` |
| `Strata::US::ListComponent` | `unstyled:`, `ordered:`, `classes:` | `with_item` |
| `Strata::US::TableComponent` | `borderless:`, `width_full:`, `scrollable:` | `with_header`, `with_row` → `with_cell` |
| `Strata::Flows::TaskListComponent` | `flow:`, `show_step_label:` | — |
| `Strata::Cases::IndexComponent` | `cases:`, `model_class:`, `case_row_component_class:`, `title:` | — |
| `Strata::Cases::CaseRowComponent` | subclassed | — |
| `Strata::Tasks::TaskRowComponent` | subclassed | — |

Plus the `strata_link_to` helper, used 24 times, which renders a link as a USWDS button:

```erb
<%= strata_link_to t("actions.back"), back_path, as: :button, variant: :outline %>
<%= strata_link_to t(".new_button"), new_contribution_payment_form_path, as: :button %>
```

23 of the 24 `strata_link_to` calls pass `as: :button`; 14 of those also pass `variant: :outline`
for a secondary action, the remaining 9 render as primary buttons, and one `strata_link_to`
(`app/components/documents/file_table_component.html.erb`) renders a plain link.

## USWDS primitives

Alerts take content through two slots rather than a single block:

```erb
<%# app/views/employers/contribution_payment_forms/ach_credit_instructions.html.erb %>
<%= render Strata::US::AlertComponent.new(type: :warning) do |alert| %>
  <% alert.with_heading { t(".undesigned_heading") } %>
  <% alert.with_body { t(".undesigned_body") } %>
<% end %>
```

`slim: true` is used for the compact inline variant (`Strata::US::AlertComponent.new(type: :info,
slim: true)`).

Lists are built from an i18n hash in one line, which keeps a bulleted list fully translatable:

```erb
<%= render Strata::US::ListComponent.new do |list| %>
  <% t(".employee_payroll_items").each_value { |item| list.with_item { item } } %>
<% end %>
```

Tables declare headers then rows, each row yielding a cell builder:

```erb
<%# app/views/employers/quarterly_wage_report_forms/index.html.erb %>
<%= render Strata::US::TableComponent.new(borderless: true, width_full: true) do |table| %>
  <% table.with_header { t(".columns.reporting_period") } %>
  <% table.with_header { t(".columns.employer") } %>
  <% table.with_header { t(".columns.ein") } %>
  <% table.with_header { t(".columns.report_filing_status") } %>
  <% table.with_header { t(".columns.contributions_status") } %>
  <% @quarterly_wage_report_forms.each do |report| %>
    <% table.with_row do |row| %>
      <% row.with_cell do %>
        <%= link_to report.reporting_period_label, quarterly_wage_report_form_path(report), class: "usa-link" %>
      <% end %>
      <% row.with_cell { report.employer_name.presence || current_employer&.name } %>
      <% row.with_cell { report.employer_ein.presence || format_ein(current_employer&.fein) } %>
      <% row.with_cell { t(".filing_statuses.#{report.submitted? ? 'submitted' : 'in_progress'}") } %>
      <% row.with_cell { t(".contribution_statuses.#{report.submitted? ? 'due' : 'awaiting_report'}") } %>
    <% end %>
  <% end %>
<% end %>
```

Button groups wrap the shared form footer, mixing a `strata_link_to` back button with the form's own
submit:

```erb
<%# app/views/employers/contribution_payment_forms/_form_buttons.html.erb %>
<%= render Strata::US::ButtonGroupComponent.new do |group| %>
  <% group.with_item do %>
    <%= strata_link_to t("actions.back"), back_path, as: :button, variant: :outline %>
  <% end %>
  <% group.with_item do %>
    <%= f.submit submit_text || t("actions.save_and_continue") %>
  <% end %>
<% end %>
```

When a plain Rails `f.submit` needs to look like the SDK's button, the app borrows the class list
rather than nesting components:

```erb
<%= f.submit t(".submit_button"), class: Strata::US::ButtonComponent.css_classes %>
```

## The flow task list

`Strata::Flows::TaskListComponent` renders a flow's `task` blocks as a progress list. It appears in
three places, and the applicant view opts into step labels:

```erb
<%# app/views/leave_applications/show.html.erb %>
<ul class="usa-collection">
    <%= render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true) %>
</ul>
```

```erb
<%# app/views/employers/{contribution_payment_forms,quarterly_wage_report_forms}/show.html.erb %>
<%= render Strata::Flows::TaskListComponent.new(flow: @flow) %>
```

Because it takes `@flow`, the component works anywhere the flow controller has set the ivar. Note the
applicant page wraps it in its own `<ul class="usa-collection">`.

## The case index, and subclassing its row

The staff case queue is one SDK component call plus a row subclass:

```erb
<%# app/views/leave_application_cases/index.html.erb %>
<%= render Strata::Cases::IndexComponent.new(
  cases: @leave_application_cases,
  model_class: LeaveApplicationCase,
  case_row_component_class: LeaveApplicationCaseRowComponent,
  title: LeaveApplicationCase.name.titleize.sub('Case', 'Cases')
) %>
```

The row subclass declares its columns as a class method, then defines a method per column name:

```ruby
# app/components/leave_application_case_row_component.rb
class LeaveApplicationCaseRowComponent < Strata::Cases::CaseRowComponent
  def self.columns
    [ :leave_case_id, :leave_type, :submitted_at, :applicant_name,
      :status, :owner, :employer_review_status, :tasks ]
  end

  def app
    @case.leave_application
  end

  def leave_case_id
    link_to @case.friendly_id, polymorphic_path(@case), class: "text-no-wrap"
  end

  def submitted_at
    return "—" unless app&.submitted_at
    content_tag(:span, l(app.submitted_at.to_date, format: :long), class: "text-no-wrap")
  end
```

**`self.columns` is the contract**: each symbol names both the column and the instance method that
renders its cell, and `@case` is the row's case (set by the base class). Cells may return a String,
`content_tag` output, a link, or another component rendered into the view context:

```ruby
def status
  return "—" unless app
  LeaveApplications::StatusTagComponent.new(application: app, plaintext: true).render_in(view_context)
end
```

The subclass can also **override** a base-class cell and fall through with `super`:

```ruby
def step
  if @case.leave_application.open_information_request.present?
    t(".steps.information_requested")
  else
    super
  end
end
```

(`step` is not in this row's `columns`, so it is the base component's own step rendering being
specialized.) The `due_on` helper reads the business process to decide which date matters — see
[business process](./business-process.md).

The task queue follows the same pattern with a much smaller subclass, injected through the
controller rather than a view:

```ruby
# app/components/task_row_component.rb
class TaskRowComponent < Strata::Tasks::TaskRowComponent
  def self.columns
    %i[due_date type case_id created_date]
  end

  def type
    t("tasks.types.#{@task.type.underscore}")
  end

  def case_id
    link_to @task.case.friendly_id, polymorphic_path(@task.case), class: "text-no-wrap"
  end
end
```

```ruby
# app/controllers/tasks_controller.rb
def tasks_index_locals
  super.merge(task_row_component_class: TaskRowComponent)
end
```

Here `due_date` and `created_date` are left to the base class; only the two app-specific cells are
defined. The row's record is `@task`.

## Where the app builds its own instead

The app has seven ViewComponents of its own. Five are plain `ViewComponent::Base` subclasses;
only the two staff-table rows extend an SDK component:

| Component | Why it exists |
|---|---|
| `TagComponent`, `LeaveApplications::StatusTagComponent`, `ExemptionRequests::StatusTagComponent` | Status pills with an app-specific colour palette and status vocabulary |
| `AccordionComponent` | USWDS accordion (`renders_one :heading`, `renders_one :body`; `id:`/`white:`/`expanded:`/`thin:`) |
| `Documents::FileTableComponent` | Uploaded-document table with its own i18n sidecar (`.en.yml`) |
| `LeaveApplicationCaseRowComponent`, `TaskRowComponent` | The SDK row subclasses above |

One SDK gap is recorded explicitly, in `QuarterlyWageReportForm`:

```ruby
# Manual entry repeater. `accepts_nested_attributes_for` is plain Rails;
# the SDK provides no repeater view component.
```

So the employee-wage repeater is hand-built in the view: the controller seeds up to three spare
blank rows (`BLANK_WAGE_RECORD_ROWS`) and the model caps manual entry at
`MANUAL_ENTRY_MAX_RECORDS = 50`.

## Previewing components

Components and flow pages are previewed with Lookbook (`app/previews/**`, 42 previews), gated on
`ENABLE_LOOKBOOK` per `docs/paidleave/lookbook.md`. Two previews render SDK templates directly:

```ruby
# app/previews/form_flows/leave_application_flow_preview.rb
render template: "strata/previews/_business_process", locals: {
  business_process: Flows::LeaveApplicationFlow
}
```

which is the SDK shipping a preview partial the consuming app can point at its own flow.
