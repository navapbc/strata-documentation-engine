---
id: example-strata-paidleave-business-process
title: Leave application business process (Strata::BusinessProcess)
source: strata-paidleave
doc_type: example
tags: [example-app, business-process, workflow, events]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-cases-and-tasks
  - example-strata-paidleave-determinations
demonstrates:
  - business-process
  - task/applicant-task
  - task/staff-task
  - concerns/step
summary: How the paid leave app declares a four-step Strata::BusinessProcess over a leave application case, mixing applicant tasks, a system step, and a staff task, and drives transitions with published events.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/business_processes/leave_application_business_process.rb
    - paidleave/app/models/leave_application.rb
    - paidleave/app/models/leave_application_employment_details.rb
    - paidleave/app/models/employer_leave_review_task.rb
    - paidleave/app/models/staff_leave_review_task.rb
    - paidleave/app/models/leave_application_case.rb
    - paidleave/app/models/employer_review.rb
    - paidleave/app/controllers/employers/reviews_controller.rb
    - paidleave/app/services/determination_recorder.rb
    - paidleave/app/components/leave_application_case_row_component.rb
    - paidleave/app/serializers/leave_application_case_serializer.rb
    - paidleave/app/views/leave_applications/shared/_status.html.erb
last_documented: 2026-09-04
verified: ok
---

# Leave application business process

`LeaveApplicationBusinessProcess` is the app's only business process. It subclasses
`Strata::BusinessProcess` and is declared entirely in the class body — steps, the start trigger,
and the event-driven transitions:

```ruby
# app/business_processes/leave_application_business_process.rb
class LeaveApplicationBusinessProcess < Strata::BusinessProcess
  SUBMIT_APPLICATION = "submit_application"
  EMPLOYER_LEAVE_REVIEW = "employer_leave_review"
  STAFF_LEAVE_REVIEW = "staff_leave_review"
  SUBMIT_REQUEST_FOR_INFORMATION = "submit_request_for_information"
  END_STEP = "end"

  def self.case_class
    "LeaveApplicationCase".constantize
  end

  # Tasks
  applicant_task(SUBMIT_APPLICATION)
  step(EMPLOYER_LEAVE_REVIEW, EmployerLeaveReviewTask.new)
  staff_task(STAFF_LEAVE_REVIEW, StaffLeaveReviewTask)
  applicant_task(SUBMIT_REQUEST_FOR_INFORMATION)

  start_on_application_form_created(SUBMIT_APPLICATION)

  transition(SUBMIT_APPLICATION, "LeaveApplicationSubmitted", EMPLOYER_LEAVE_REVIEW)
  transition(EMPLOYER_LEAVE_REVIEW, "EmployerReviewCompleted", STAFF_LEAVE_REVIEW)

  # Determination flow
  transition(EMPLOYER_LEAVE_REVIEW, "LeaveApplicationDenied", END_STEP)
  transition(EMPLOYER_LEAVE_REVIEW, "LeaveApplicationApproved", END_STEP)
  transition(STAFF_LEAVE_REVIEW, "LeaveApplicationDenied", END_STEP)
  transition(STAFF_LEAVE_REVIEW, "LeaveApplicationApproved", END_STEP)
end
```

Three different step kinds appear in one process, which is the interesting part of this example:

| Declaration | Step kind | What it is here |
|---|---|---|
| `applicant_task(SUBMIT_APPLICATION)` | applicant task | Waiting on the applicant to submit the leave application |
| `step(EMPLOYER_LEAVE_REVIEW, EmployerLeaveReviewTask.new)` | system step (an instance, not a class) | Fans out one `EmployerReview` row per employer the applicant is taking leave from |
| `staff_task(STAFF_LEAVE_REVIEW, StaffLeaveReviewTask)` | staff task (a `Strata::Task` **class**) | Creates the reviewable task row staff work from |
| `applicant_task(SUBMIT_REQUEST_FOR_INFORMATION)` | applicant task | Declared, but no transition targets it — see the gap note below |

Note the asymmetry in these two call shapes: `step` is passed an **instance** of a `Strata::Step`
includer, `staff_task` the task **class**. The SDK itself is an external git gem (see
`Gemfile`) with no source in this checkout, so what the SDK requires here is inferred from the call
shape in this app; see [strata-sdk-business-process](../strata-sdk/strata-sdk-business-process.md) for the
SDK-side contract.

## The system step

`EmployerLeaveReviewTask` is not an Active Record model at all — it is a plain class that includes
the SDK's step concern and implements `execute(kase)`:

```ruby
# app/models/employer_leave_review_task.rb
class EmployerLeaveReviewTask
  include Strata::Step

  def execute(kase)
    ActiveRecord::Base.transaction do
      kase.leave_application.employment_details.taking_leave.each do |employment|
        EmployerReview.create!(
          leave_application: kase.leave_application,
          employer: employment.employer,
          due_at: EmployerReview.default_due_at
        )
      end
    end
  end
end
```

`execute` receives the case (named `kase` to avoid Ruby's `case` keyword) and reaches the
application through `Strata::Case`'s association. Because it fans out to *n* reviews, the step's
work is wrapped in a transaction rather than left to the SDK.

## Events drive the transitions

Transitions are keyed on event names. The process names four distinct events
(`LeaveApplicationSubmitted`, `EmployerReviewCompleted`, `LeaveApplicationApproved`,
`LeaveApplicationDenied`), and the app publishes three of the four itself with
`Strata::EventManager.publish`:

```ruby
# app/models/employer_review.rb — after an employer submits their verification
def publish_submission
  Rails.logger.debug "Publishing event #{self.class.name}Completed for review with ID: #{id}"
  Strata::EventManager.publish("#{self.class.name}Completed", { application_form_id: leave_application.id })
end
```

The event name is derived from the class name, so `EmployerReview` produces exactly the
`"EmployerReviewCompleted"` string the transition names. It is called from
`Employers::ReviewsController#submit` right after the review saves.

The determination events are published by `DeterminationRecorder`, keyed by case id rather than
application id:

```ruby
# app/services/determination_recorder.rb
event_name = "#{LeaveApplication.name}#{@outcome.titlecase}"
Strata::EventManager.publish(event_name, { case_id: leave_application_case.id })
```

`@outcome` is constrained to `%w[approved denied]` precisely so the derived name always matches a
declared transition — the service's own comment says an unrecognized outcome "would record a
determination that never advances (or closes) the case."

`"LeaveApplicationSubmitted"` is **not** published anywhere under `paidleave/app`. The app declares
the transition and nothing else; only the `EmployerReviewCompleted` and
`LeaveApplication{Approved,Denied}` events have app-side publishers. Presumably the SDK's
application-form submission emits it — that is an inference from the missing publisher, not
something verifiable from this checkout (the SDK is an external gem), so confirm it against
[strata-sdk-business-process](../strata-sdk/strata-sdk-business-process.md).

Because both the employer-review and staff-review steps have `Approved`/`Denied` transitions to
`END_STEP`, a determination can close the case from either step. `LeaveApplication#determinable?`
relies on that:

```ruby
# app/models/leave_application.rb
def determinable?
  # A determination can be recorded as soon as the application is submitted and
  # its case is still open and undetermined — INCLUDING before the employer
  # completes their review (so no staff review task exists yet). The business
  # process closes the case from either the employer- or staff-review step
  # (LeaveApplicationApproved/Denied -> END_STEP), and DeterminationRecorder
  # no-ops the staff review task when it is absent.
  submitted? && self.case&.open? && determinations.none?
end
```

## Reading the current step

Three call sites read process state off the case, using two different SDK accessors:

```ruby
# app/serializers/leave_application_case_serializer.rb
current_step: @case.business_process_current_step

# app/views/leave_applications/shared/_status.html.erb
current_step = leave_application.case&.business_process_current_step
decision_complete = current_step == LeaveApplicationBusinessProcess::END_STEP

# app/components/leave_application_case_row_component.rb — #due_on
step_name = @case.business_process_instance.current_step
step = @case.class.business_process.get_step(step_name)

if step.class == EmployerLeaveReviewTask
  app.current_employer_review ? l(app.current_employer_review.due_at) : "—"
# ...
```

The `_status.html.erb` partial computes `decision_complete` but never reads it — the assignment is
dangling, so it gates nothing today.

The case row component's `due_on` goes through `business_process_instance` and
`business_process.get_step` so it can compare the resolved step object's class against
`EmployerLeaveReviewTask` and pick the right due date to show staff. It branches three ways: while
the process sits on the system step it shows `current_employer_review.due_at` — and
`current_employer_review` is `order(created_at: :desc)`, the *most recent* employer review
regardless of employer or state, not specifically the pending one; failing that, if the application
has an `open_information_request` it shows that request's `due_at`; otherwise it shows the earliest
`due_on` among the case's incomplete tasks.

## Gaps worth knowing

- **`SUBMIT_REQUEST_FOR_INFORMATION` is unreachable.** The step is declared, but no `transition`
  targets it, and the app's request-for-information feature is modeled outside the process
  (`InformationRequest`, whose open state is surfaced through
  `LeaveApplication#display_status` and the case row's `step` override instead).
- **`StaffLeaveReviewTask` is an empty subclass** — see [cases and tasks](./cases-and-tasks.md).
- The case-row `owner` column is hardcoded to a name with a `TODO`, so assignment is not modeled
  by the process.
