---
id: example-oscer-tasks
title: OSCER — tasks (applicant, staff, system)
source: oscer
doc_type: example
tags: [example-app, oscer, task, staff-task, applicant-task, system-process]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-authorization
  - example-oscer-components
demonstrates: [task, task/applicant-task, task/staff-task, task/system-process]
summary: How OSCER subclasses Strata::Task and declares applicant, staff, and system steps that the certification business process drives.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/oscer_task.rb
    - reporting-app/app/models/review_activity_report_task.rb
    - reporting-app/app/models/review_exemption_claim_task.rb
    - reporting-app/app/models/review_denial_response_task.rb
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/helpers/strata/tasks_helper.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — tasks (applicant, staff, system)

OSCER uses all three task styles the SDK's business-process DSL provides — **system processes**
(automated), **applicant tasks**, and **staff tasks** — and subclasses `Strata::Task` for its
concrete staff review tasks.

## Task step declarations

The three task kinds are declared on the business process
(`app/business_processes/certification_business_process.rb`):

```ruby
# Automated determination steps (no human in the loop)
system_process(EXTERNAL_EXCLUSION_CHECK_STEP, ->(kase) {
  ExclusionDeterminationService.determine(kase)
})
system_process(EXTERNAL_EXCEPTION_CHECK_STEP, ->(kase) {
  ExceptionDeterminationService.determine(kase)
})
system_process(EXTERNAL_COMMUNITY_ENGAGEMENT_CHECK_STEP, ->(kase) {
  CommunityEngagementCheckService.determine(kase)
})
system_process(VERIFICATION_DATA_SOURCE_CHECK_STEP, ->(kase) {
  DataSourceCheckService.determine(kase)
})

# Member-facing step
applicant_task(REPORT_ACTIVITIES_STEP)

# Caseworker review steps, each bound to a concrete Strata::Task subclass
staff_task(REVIEW_ACTIVITY_REPORT_STEP, ReviewActivityReportTask)
staff_task(REVIEW_EXEMPTION_CLAIM_STEP, ReviewExemptionClaimTask)
staff_task(REVIEW_DENIAL_RESPONSE_STEP, ReviewDenialResponseTask)
```

- A `system_process` runs a lambda against the case (here, the four determination services). No
  task record or human action is involved; the service publishes the event that drives the next
  transition. Because the SDK hands a `system_process` only the case (never the triggering event),
  `DataSourceCheckService` has to recompute the in-hand assessment rather than read it off the
  event payload — see [verification data sources](./verification-data-sources.md).
- The `applicant_task` (`report_activities`) is the member-facing step where the member submits an
  application form. Its transitions are keyed off form-submission events.
- Each `staff_task` names a concrete `Strata::Task` subclass that the caseworker queue materializes.

## Base task subclass

`OscerTask < Strata::Task` (`app/models/oscer_task.rb`) is the app's base task. It adds a default
`due_on`, points the SDK at the app's task policy, and defines `ensure_application_form` to attach
the right pending application form to the task:

```ruby
class OscerTask < Strata::Task
  attribute :due_on, :date, default: -> { 7.days.from_now.to_date }

  def self.policy_class
    Strata::TaskPolicy
  end

  private

  # Picks the oldest application form of the task's form class for this case
  # that no strata_task is attached to yet.
  def ensure_application_form
    # ... LEFT JOIN strata_tasks ... WHERE strata_tasks.application_form_id IS NULL
  end
end
```

The three concrete staff tasks subclass `OscerTask`, hook `ensure_application_form` on
`before_validation`, declare the `belongs_to :application_form` association to their form class, add
an `approval_status` enum to record the reviewer's decision, and expose
`self.application_form_class` (which `ensure_application_form` reads):

```ruby
class ReviewActivityReportTask < OscerTask
  before_validation :ensure_application_form
  belongs_to :application_form, class_name: ActivityReportApplicationForm.name, inverse_of: :review_task, strict_loading: false
  enum :approval_status, { approved: "approved", denied: "denied" }

  def self.application_form_class
    ActivityReportApplicationForm
  end
end
```

`approval_status` is `nil` until the reviewer decides, which the source notes is deliberately
distinguishable from `approved`/`denied`. `ReviewExemptionClaimTask` and `ReviewDenialResponseTask`
follow the same shape against `ExemptionApplicationForm` and `DenialResponseApplicationForm`.

## Task controller

`TasksController < Strata::TasksController` (`app/controllers/tasks_controller.rb`) extends the SDK's
task controller. It overrides `index`, `pick_up_next_task`, and `filter_tasks` to apply
`policy_scope` (so caseworkers only see tasks in their region), overrides `assign` to add audit
logging, and adds information-request actions. `index` and `pick_up_next_task` scope `Strata::Task`
directly (`policy_scope(Strata::Task)`), while `filter_tasks` applies `policy_scope` to `super`'s
result (`policy_scope super, policy_scope_class: Strata::TaskPolicy::Scope`). `assign` itself does no
scoping; its record-level authorization comes from the overridden `set_task`, which calls
`authorize @task`. It queries the SDK's `Strata::Task` scopes directly — e.g.
`policy_scope(Strata::Task).incomplete.unassigned` and `with_status(:completed)` — and renders the
SDK's `strata/tasks/index` view (passing `Staff::TaskRowComponent` as the row component; see
[components](./components.md)). Region scoping is delegated to `Strata::TaskPolicy::Scope` (see
[authorization](./authorization.md)). `assign` is not a scope but an instance method on
`Strata::Task`: the `assign` and `pick_up_next_task` actions call `task.assign(current_user.id)` on
the single task the caseworker picked up.

The SDK's task statuses surfaced in the UI are `pending`, `on_hold`, and `completed` (see the tab
helper in `app/helpers/strata/tasks_helper.rb`); the controller also overrides
`filter_tasks_by_status`, which maps those tabs onto the SDK scope — `with_status(:completed)`,
`with_status(:on_hold)`, and `with_status(:pending)` as the default. The `assign`/`pick_up_next_task`
actions wrap each assignment in a `Strata::AuditLog.record` block (see
[audit log and actors](./audit-log-and-actors.md)).
