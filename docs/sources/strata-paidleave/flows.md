---
id: example-strata-paidleave-flows
title: Multi-page flows (Strata::Flows::ApplicationFormFlow)
source: strata-paidleave
doc_type: example
tags: [example-app, flow, routing, branching, loops]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-application-forms
  - example-strata-paidleave-form-builder
  - example-strata-paidleave-components
demonstrates:
  - application-form-flow
summary: How the paid leave app defines five flows with tasks, question pages, info pages, conditional pages and a repeating loop, mounts their routes, and drives them from Strata::Flows::ApplicationFormController.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/models/flows/leave_application_flow.rb
    - paidleave/app/models/flows/change_request_flow.rb
    - paidleave/app/models/flows/exemption_request_flow.rb
    - paidleave/app/models/flows/quarterly_wage_report_flow.rb
    - paidleave/app/models/flows/contribution_payment_flow.rb
    - paidleave/app/controllers/leave_applications_controller.rb
    - paidleave/app/controllers/employers/quarterly_wage_report_forms_controller.rb
    - paidleave/app/controllers/employers/exemption_requests_controller.rb
    - paidleave/config/routes.rb
    - paidleave/app/views/leave_applications/edit_employment_details_employer_notification.html.erb
    - paidleave/app/previews/applicants/leave_applications/employment_details/employer_notification_preview.rb
last_documented: 2026-09-04
verified: ok
---

# Multi-page flows

Every flow in the app is a plain class that mixes in the SDK flow concern:

```ruby
class Flows::LeaveApplicationFlow
  include Strata::Flows::ApplicationFormFlow
```

The five flows between them use every construct the DSL offers.

## Tasks and question pages

The applicant flow groups its pages into four named `task` blocks, which become the sections of the
task list the applicant sees:

```ruby
# app/models/flows/leave_application_flow.rb
task :personal_information do
  question_page :name, fields: [
    :applicant_name_first, :applicant_name_middle, :applicant_name_last, :applicant_name_suffix
  ]
  question_page :addresses, fields: [ ... ]
  question_page :phone_number, fields: [ :phone_number, :phone_number_type ]
  question_page :date_of_birth, fields: [
    date_of_birth: [ :month, :day, :year ]
  ]
  question_page :tax_identifier
  question_page :state_id, fields: [ :has_driver_license_or_id_number, :driver_license_or_id_number ]
end
```

Three details in that block:

- `fields:` is the page's **strong-parameter permit list**. A composite attribute is permitted as a
  nested hash — `date_of_birth: [ :month, :day, :year ]` for a `:memorable_date`, and the expanded
  column names (`applicant_name_first`, ...) for `:name` and `:address`. See
  [attributes](./attributes.md).
- `question_page :tax_identifier` takes **no** `fields:` — the page's field defaults from the page
  name.
- Nested associations are permitted with Rails' `_attributes` convention:
  `leave_period_attributes: [ :id, :start_date, :end_date ]`,
  `employment_details_attributes: [ :id, :employer_id, :_destroy ]`,
  `supporting_documents: [], removed_document_ids: []` for the file inputs.

## Info pages

`info_page` declares a page that collects nothing but still lives inside a task. The one use in the
app passes `context:`, naming the validation context of the page that follows it:

```ruby
task :employment_details do
  info_page :start_employment_details, context: :employers
  question_page :employers, fields: [ ... ]
```

Both employer flows explain in comments why they *avoided* `info_page` and used standalone
controller actions instead:

```ruby
# app/models/flows/quarterly_wage_report_flow.rb
#   - "Requirements overview" — informational only. Informational
#     pages inside a task block always read as "completed" and corrupt task
#     completion state, so this is a standalone controller action.
```

That is the trade-off the two approaches make: `info_page` with a borrowed `context:` keeps the page
in the flow's navigation, an ordinary action keeps it out of completion accounting entirely.

## Conditional pages

`if:` takes a lambda over the record. `ExemptionRequestFlow` uses it for two mutually exclusive
branches:

```ruby
# app/models/flows/exemption_request_flow.rb
question_page :commercial_plan_details, fields: [ ... ],
  if: ->(request) { request.plan_type_commercial? }

question_page :self_insured_plan_details, fields: [ ... ],
  if: ->(request) { request.plan_type_self_insured? }
```

and `ContributionPaymentFlow` for a skip:

```ruby
# app/models/flows/contribution_payment_flow.rb
# ACH debit bank details. ACH credit skips this page and
# goes to the remittance-instructions screen instead.
question_page :ach_debit_bank_details, fields: [ ... ],
  if: ->(record) { record.ach_debit? }
```

The comment atop that flow names the SDK mechanism this relies on:
"`TaskEvaluator#next_path` skips pages whose `if:` lambda is false".

Two consequences the app documents:

1. **Every conditional page needs the matching guard on its validations too** —
   `Task#completed?` checks all pages, not only the needed ones (see
   [application forms](./application-forms.md)).
2. **A single-task flow routes the last completed page straight to `end_page`** instead of back to
   a task list, which is why both employer wizards are modeled as one `task` block:

   ```ruby
   # Modeled as ONE task: a linear wizard with a single task. The
   # SDK routes the last completed page straight to `end_page` instead of back to a
   # task list.
   ```

## Loops

The applicant flow repeats one page per employer the applicant is taking leave from:

```ruby
loop :employment_details, scope: :taking_leave do
  question_page :employer_notification, fields: [
    :employer_notified, :employer_notification_date,
    :employer_notification_method, :employer_notification_method_other
  ]
end
```

`loop` names the association (`employment_details`) and a `scope:` on it (`taking_leave`, defined on
`LeaveApplicationEmploymentDetails`). Inside the loop the current child is `@flow_task.loop_record`,
and the form is bound to the **child**, not the application:

```erb
<%# app/views/leave_applications/edit_employment_details_employer_notification.html.erb %>
<%= strata_form_with model: @flow_task.loop_record, url: @flow_task.update_path, method: :patch do |f| %>
  <% employer = @flow_task.loop_record.employer %>
```

The Lookbook preview for that page shows how to resolve a loop page outside a request, including the
loop record id:

```ruby
# app/previews/.../employer_notification_preview.rb
flow = Flows::LeaveApplicationFlow.new(leave_application)
flow_page, flow_task = Flows::LeaveApplicationFlow.find_page_and_task_by_action(
  leave_application, :edit_employment_details_employer_notification, loop_record.id
)
```

## End pages

Every flow ends with `end_page :review`, and every one needs a matching member route:

```ruby
# app/models/flows/contribution_payment_flow.rb
# An explicit review step before the ACH submit; the SDK requires an end_page
# regardless. Requires a `get :review` member route.
end_page :review
```

## Mounting the routes

Flow page routes are generated by the SDK's `mount_flow_routes` inside the resource block; the
non-flow steps (`review`, `submit`, branch-specific pages) are declared by hand alongside:

```ruby
# config/routes.rb
resources "leave_applications", only: [ :index, :show, :new, :create, :destroy ] do
  member do
    get :review
    get :delete
    patch :submit
    get :search_employer
    # ...
  end

  mount_flow_routes Flows::LeaveApplicationFlow
end
```

Two routing constraints the app hit and recorded:

```ruby
# Use `scope path:/module:` rather than `namespace :employers`
# as to not prefix helpers with employers_ (e.g. `employers_contribution_payment_forms_path`), which is
# incompatible with Strata conventions.
scope path: "employers", module: "employers" do
```

```ruby
# Not namespaced under :employers even though the controller is: the Strata
# flow builds its path helpers as "<page>_<record_class>_path", so the route
# names must stay un-namespaced for the flow to resolve them.
resources :exemption_requests, ..., controller: "employers/exemption_requests" do
```

If you take one thing from this doc into a new app: **the flow derives path helpers from the record
class name, so flow-owned resources cannot live inside a `namespace`.**

## Driving a flow from a controller

Each flow's controller mixes in `Strata::Flows::ApplicationFormController` and declares its flow:

```ruby
# app/controllers/employers/quarterly_wage_report_forms_controller.rb
class Employers::QuarterlyWageReportFormsController < ApplicationController
  include Strata::Flows::ApplicationFormController

  # Must be declared BEFORE `flow` — `flow` appends its own before_actions and
  # they run after these, so the record has to exist by then.
  before_action :set_new_form, only: [ :new, :create, :overview ]
  before_action :set_form, except: [ :new, :create, :index, :overview ]

  flow Flows::QuarterlyWageReportFlow
  layout "quarterly_wage_report_form", only: Flows::QuarterlyWageReportFlow.generated_routes

  def on_flow_update_invalid(record)
    flash.now[:errors] = record.formatted_errors
  end
```

The **callback ordering note is a real trap**: `flow` appends its own `before_action`s, so the
record-loading callbacks must be declared above it.

| Hook / accessor | What the app does with it |
|---|---|
| `flow <FlowClass>` | Registers the flow and its per-page actions |
| `flow_record` | Private method every flow controller defines, returning its ivar |
| `flow_record_id` | Used in `set_current_*` to find the record for a flow action |
| `on_flow_update_invalid(record)` | All five controllers use it to put `formatted_errors` in the flash |
| `@flow` | `@flow.pages.first.path(record)` after create; `@flow.start_path`; `@flow.pages.second` |
| `@flow_task` | `update_path`, `prev_path`, `next_path`, `loop_record` in views |
| `@flow_page` | `@flow_page.name` as a save context, `@flow_page.pathname` to re-render |
| `<Flow>.generated_routes` | Layout selection and Pundit action mapping |
| `<Flow>.all_pages`, `page.needed?(record)` | `ExemptionRequest#required_contexts` |

`generated_routes` does double duty — picking the wizard layout, and deciding which policy method a
flow action authorizes against:

```ruby
# app/controllers/leave_applications_controller.rb
def resolve_layout
  if Flows::LeaveApplicationFlow.generated_routes.include?(action_name)
    "leave_application_form"
  elsif action_name == "review"
    "application"
  else
    "applicant"
  end
end

def set_current_leave_application
  action_permission = Flows::LeaveApplicationFlow.generated_routes.include?(action_name) || action_name == "search_employer" ? :update? : nil
  @leave_application ||= authorize(LeaveApplication.find(flow_record_id), action_permission)
end
```

## Overriding a generated page action

When a page needs behavior the SDK's generated update cannot express, the app defines the action by
hand and finishes it with the flow's own navigation. The supporting-documents page is the clearest
case — it has to create and destroy attachments, honor a "skip" affordance, and only then advance:

```ruby
# app/controllers/leave_applications_controller.rb
def update_supporting_documents
  if params[:skip].present? && @leave_application.leave_period&.leave_type_bonding?
    return redirect_to @flow_task.next_path || @flow.start_path
  end
  # ... create new documents, destroy removed ones ...
  if @leave_application.valid? && @leave_application.save(context: @flow_page.name)
    redirect_to @flow_task.next_path || @flow.start_path
  else
    flash.now[:errors] = @leave_application.formatted_errors
    render @flow_page.pathname, status: :unprocessable_entity
  end
end
```

`save(context: @flow_page.name)` is how a hand-written action keeps using the flow's page-scoped
validation context.

`Employers::ExemptionRequestsController` shows the same idea applied to entry — its `new` and
`create` both call `start_new_request`, which saves the draft and picks the landing page by index:

```ruby
next_page = @exemption_request.employer.present? ? @flow.pages.second : @flow.pages.first
redirect_to next_page.path(@exemption_request)
```

i.e. skip the employer-id page when the employer is already known.
