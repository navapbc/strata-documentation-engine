---
id: example-strata-paidleave-cases-and-tasks
title: Leave application cases and tasks (Strata::Case, Strata::Task)
source: strata-paidleave
doc_type: example
tags: [example-app, case, task, staff-dashboard]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-business-process
  - example-strata-paidleave-components
  - example-strata-paidleave-determinations
demonstrates:
  - case
  - task
  - task/staff-task
summary: How the paid leave app subclasses Strata::Case and Strata::Task, links the case to its application form, and builds a staff dashboard on Strata::StaffController and Strata::TasksController.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/models/leave_application_case.rb
    - paidleave/app/models/staff_leave_review_task.rb
    - paidleave/app/models/leave_application.rb
    - paidleave/app/models/user.rb
    - paidleave/app/controllers/staff_controller.rb
    - paidleave/app/controllers/tasks_controller.rb
    - paidleave/app/controllers/leave_application_cases_controller.rb
    - paidleave/app/jobs/create_leave_application_case_job.rb
    - paidleave/app/serializers/leave_application_case_serializer.rb
    - paidleave/app/services/determination_recorder.rb
    - paidleave/app/views/leave_application_cases/_tasks_sidebar.html.erb
    - paidleave/app/views/leave_application_cases/tasks.html.erb
last_documented: 2026-09-04
verified: ok
---

# Leave application cases and tasks

## The case

`LeaveApplicationCase` subclasses `Strata::Case` and wires the case to its application form in both
directions:

```ruby
# app/models/leave_application_case.rb
class LeaveApplicationCase < Strata::Case
  belongs_to :leave_application, foreign_key: "application_form_id"
  has_one :open_staff_review_task, -> { incomplete.with_type(StaffLeaveReviewTask.name) }, as: :case, class_name: "Strata::Task"

  def self.application_form_class
    "LeaveApplication"
  end

  def create_task(task_class, **attributes)
    task_class.create!(
      **{ case: self, due_on: 20.days.from_now }.merge(attributes.symbolize_keys)
    )
  end

  def friendly_id
    "LEAV-#{id[0..7].upcase}"
  end
end
```

Four things to note:

- **`application_form_class` returns a String.** The SDK's own
  `Strata::Case.application_form_class` returns `name.sub("Case", "ApplicationForm")` — a class
  *name*, not a class, which its comment attributes to "a build issue, which is resolvable in
  upgrading to Rails 8", leaving callers to constantize downstream. The app overrides it because
  that default would produce `LeaveApplicationApplicationForm` (the form class here is
  `LeaveApplication`), so the override returns the correct name rather than changing the return
  type.
- **`application_form_id`** is the SDK's column name; the `belongs_to` renames the association to
  the domain term. The other direction is declared on the application:
  `has_one :case, class_name: "LeaveApplicationCase", foreign_key: "application_form_id"`.
- **`create_task` is overridden to supply a default due date** (20 days out) that the SDK's own task
  creation does not set. It still delegates to the task class's `create!`, so callers can override
  any attribute — but it also drops the SDK version's
  `raise ArgumentError unless task_class <= Strata::Task` guard, so a non-task class fails later and
  less clearly than it would through the base implementation.
- **`friendly_id`** derives a human reference (`LEAV-XXXXXXXX`) from the UUID primary key. It is
  the reference number shown to applicants and used as the case-queue link text.

Nothing in `paidleave/app` creates a `LeaveApplicationCase` explicitly — the business process is
declared to start when the application form is created
(`start_on_application_form_created(SUBMIT_APPLICATION)`), and this pair of class methods is how the
SDK knows which case class goes with which form. `CreateLeaveApplicationCaseJob` is a *different*
thing despite the name: it notifies the external case management service. Those are two separate
"cases", one Strata-side and one in the downstream system.

## The task

`StaffLeaveReviewTask` is a bare `Strata::Task` subclass — a deliberate example of how little a
staff task needs:

```ruby
# app/models/staff_leave_review_task.rb
class StaffLeaveReviewTask < Strata::Task
  # Add custom attributes and behavior here

  # Example:
  # attribute :custom_field, :string
  # validates :custom_field, presence: true
end
```

Everything the app needs from it comes from the base class. The SDK surface actually exercised:

| Surface | Used in |
|---|---|
| `type` (single-table inheritance column) | `TaskRowComponent#type` translates `@task.type.underscore`; the serializer emits `task.type` |
| `incomplete` scope | `LeaveApplicationCase#open_staff_review_task`, the tasks sidebar, `DeterminationRecorder` |
| `with_type(...)` scope | `open_staff_review_task`, `DeterminationRecorder` |
| `status` | `review_task&.update!(status: :completed)` in `DeterminationRecorder` |
| `due_on` | `create_task`'s default, the tasks sidebar's current/upcoming split, `LeaveApplication#processing_due_date` |
| `case` polymorphic association | `TaskRowComponent#case_id`, `create_task` |
| `assignee_id` | `User has_many :tasks, class_name: "Strata::Task", foreign_key: :assignee_id` |

Task completion is a side effect of recording a determination rather than an action of its own:

```ruby
# app/services/determination_recorder.rb
review_task = leave_application_case.tasks.incomplete.with_type(StaffLeaveReviewTask.name).first
# ...
review_task&.update!(status: :completed)
```

The `&.` is load-bearing: a determination may be recorded before the employer-review step has run,
in which case no staff task exists yet (see
[business process](./business-process.md)).

## Staff dashboard

The staff side is two SDK controller subclasses plus one app controller that inherits from them:

```ruby
# app/controllers/staff_controller.rb
class StaffController < Strata::StaffController
  # TODO implement staff policy
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def index
    redirect_to leave_application_cases_path
  end

  def case_classes
    [ LeaveApplicationCase ]
  end

  protected

  # Append Payments (#229) and Employers links to the default cases/tasks
  # header links.
  def header_links
    super + [
      { name: t("staff.payments.header_link"), path: staff_payments_path },
      { name: t("staff.employers.header_link"), path: staff_employers_path }
    ]
  end
end
```

`case_classes` registers the app's one case type with the dashboard, and `header_links` extends —
rather than replaces — the SDK's default cases/tasks navigation with two app-specific links. Compare
this to a minimal SDK consumer, where `case_classes` returns `[]` and the dashboard has nothing to
show.

`TasksController` exists only to swap in a custom row renderer:

```ruby
# app/controllers/tasks_controller.rb
class TasksController < Strata::TasksController
  protected

  def tasks_index_locals
    super.merge(task_row_component_class: TaskRowComponent)
  end
end
```

The case list and case detail pages are the app's own `LeaveApplicationCasesController`, which
inherits from the app's `StaffController` (so it picks up the SDK dashboard chrome) and queries
cases directly:

```ruby
# app/controllers/leave_application_cases_controller.rb
def index
  @leave_application_cases = LeaveApplicationCase.where(status: :open)
    .joins(:leave_application).where(leave_applications: { status: :submitted })
    .includes(:leave_application).order(created_at: :desc)
  @tab = :open
end

def closed
  @leave_application_cases = LeaveApplicationCase.where(status: :closed)...
end
```

`Strata::Case#status` is queried with the `:open` / `:closed` values the app also reads through
`self.case&.open?` in `LeaveApplication#determinable?`. Rendering of the two lists is handed to the
SDK's case components — see [components](./components.md).

## Gaps worth knowing

- **Staff authorization is not implemented.** `StaffController` skips both Pundit verification
  callbacks with a `TODO`, and `User#staff?` deliberately returns `true` for every user (its own
  comment explains that `DeterminationPolicy`, `InformationRequestPolicy`, and
  `BenefitPaymentPolicy` gate on it, so narrowing it would revoke permissions from existing users).
  `has_staff_role?` is the honest role check, used for post-sign-in routing (`ApplicationController`)
  and in `can_act_as_employer?` (`employer? || has_staff_role?`), which employer-facing
  authorization is meant to consult instead of `employer?` so staff are never locked out of an
  employer capability.
- `app/views/leave_application_cases/tasks.html.erb` is still the generated placeholder — a single
  line reading "Edit me in app/views/leave_application_cases/tasks.html.erb", which is literally
  what the per-case Tasks tab renders. The `tasks` action does load `@tasks`
  (`@leave_application_case.tasks`); the template ignores it. The working task list is the
  `_tasks_sidebar` partial on the case detail page.
