---
id: example-oscer-business-process
title: OSCER — certification business process and case
source: oscer
doc_type: example
tags: [example-app, oscer, business-process, case, state-machine, events]
related:
  - example-oscer-overview
  - example-oscer-tasks
  - example-oscer-determinations
demonstrates: [business-process, case]
summary: How OSCER models the Medicaid certification lifecycle as a Strata::BusinessProcess state machine driving a Strata::Case aggregate.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/certification.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — certification business process and case

OSCER models the full Medicaid community-engagement certification lifecycle as a single
`Strata::BusinessProcess` subclass that drives a `Strata::Case` aggregate (`CertificationCase`)
through a state machine of automated and human steps.

## The business process

`CertificationBusinessProcess < Strata::BusinessProcess`
(`app/business_processes/certification_business_process.rb`) declares its steps with the SDK's DSL
(`system_process`, `applicant_task`, `staff_task`), a `start` rule, and `transition`s keyed by
domain event name:

```ruby
class CertificationBusinessProcess < Strata::BusinessProcess
  # System (automated) determination steps
  system_process(EXTERNAL_EXEMPTION_CHECK_STEP, ->(kase) {
    ExemptionDeterminationService.determine(kase)
  })
  system_process(EXTERNAL_COMMUNITY_ENGAGEMENT_CHECK_STEP, ->(kase) {
    CommunityEngagementCheckService.determine(kase)
  })

  # Human task steps
  applicant_task(REPORT_ACTIVITIES_STEP)
  staff_task(REVIEW_ACTIVITY_REPORT_STEP, ReviewActivityReportTask)
  staff_task(REVIEW_EXEMPTION_CLAIM_STEP, ReviewExemptionClaimTask)
  staff_task(REVIEW_DENIAL_RESPONSE_STEP, ReviewDenialResponseTask)

  # Entry point: a CertificationCreated event starts the process and builds the case
  start(EXTERNAL_EXEMPTION_CHECK_STEP, on: "CertificationCreated") do |event|
    CertificationCase.new(certification_id: event[:payload][:certification_id])
  end

  # Event-driven transitions between steps
  transition(EXTERNAL_EXEMPTION_CHECK_STEP, "DeterminedNotExempt", EXTERNAL_COMMUNITY_ENGAGEMENT_CHECK_STEP)
  transition(EXTERNAL_EXEMPTION_CHECK_STEP, "DeterminedExempt", END_STEP)
  # ...
end
```

The flow as declared:

1. **Start** — `CertificationCreated` (published by `Certification.after_create_commit`) starts the
   process at the external exemption check and constructs a `CertificationCase` bound to the
   certification id.
2. **External exemption check** (`system_process`) — runs `ExemptionDeterminationService.determine`.
   `DeterminedExempt` ends the case; `DeterminedNotExempt` advances to the CE check.
3. **External community-engagement check** (`system_process`) — runs
   `CommunityEngagementCheckService.determine`, which assesses aggregate hours and income from both
   member-reported and externally-sourced data.
   `DeterminedCommunityEngagementMet` ends; `DeterminedCommunityEngagementInsufficient` and
   `DeterminedCommunityEngagementActionRequired` route to the member's report-activities step.
4. **Report activities** (`applicant_task`) — the member submits one of three application forms.
   Each form's submission event (`ActivityReportApplicationFormSubmitted`,
   `ExemptionApplicationFormSubmitted`, `DenialResponseApplicationFormSubmitted`) transitions to the
   matching staff review step.
5. **Staff review** (`staff_task` × 3) — a caseworker approves/denies. Approval events end the case;
   denial events route back to report-activities (or end the case on a `…Final` event when the
   verification window has closed).

Note the transitions are written so that a **denial while the verification window is open** returns
the member to `report_activities` (e.g. `ActivityReportDenied`), whereas a **final denial**
(`ActivityReportDeniedFinal`) ends the case — the two event names are emitted by the case model
depending on window state (see below).

## The case aggregate

`CertificationCase < Strata::Case` (`app/models/certification_case.rb`) is the per-process state
carrier. It relies on SDK-provided columns documented inline (`certification_id`, `status` with the
`open`/`closed` enum, `business_process_current_step`, and a `facts` jsonb column) and adds
app-specific state via `store_accessor :facts`:

```ruby
class CertificationCase < Strata::Case
  store_accessor :facts, :activity_report_approval_status, :activity_report_approval_status_updated_at,
    :exemption_request_approval_status, # ...
```

The case exposes domain transitions (`accept_activity_report`, `deny_activity_report`,
`accept_exemption_request`, `accept_denial_response`, etc.). Each one runs inside a `transaction`,
flips the relevant approval-status accessor, calls the SDK's `close!`/`save!`, and publishes the
next workflow event. Most also record a `Determination` on the `Certification` (the
exemption-denial path instead writes a `Strata::AuditLog` entry):

```ruby
def deny_activity_report(user, application_form)
  certification = Certification.find(certification_id)
  hours_data = HoursComplianceDeterminationService.aggregate_hours_for_certification(certification, application_form:)

  transaction do
    self.activity_report_approval_status = "denied"
    verification_window_ended? ? close! : save!
    certification.record_determination!(decision_method: :manual, outcome: :not_compliant, # ...
  end

  # window state selects which event (and therefore which transition/notification) fires
  event_name = verification_window_ended? ? "ActivityReportDeniedFinal" : "ActivityReportDenied"
  Strata::EventManager.publish(event_name, { case_id: id, certification_id:, application_form_id: application_form.id })
end
```

### Verification window

The case adds a 30-day **verification window** (`VERIFICATION_WINDOW_DURATION_DAYS = 30`) — the time
a member has to resolve a negative CE determination. `open_verification_window` stamps
start/end dates and `verification_window_ended?` gates whether a denial is final. The
application-form models also read this state to refuse new submissions once the window has closed.

### Aggregate boundary

`CertificationCase` deliberately does **not** declare an ActiveRecord association to `Certification`
(only `attr_accessor :certification`), because `Certification` is a separate aggregate root; the app
avoids a DB-level dependency between aggregates and instead joins via `certification_id`
(`scope :by_region`, `self.open_certification_id_for_member`).

## Events

State changes are propagated with `Strata::EventManager.publish(<event>, payload)`. The business
process's `transition` declarations subscribe to those same event names, and
`NotificationsEventListener` subscribes for member emails (see
[audit log and actors](./audit-log-and-actors.md) and [determinations](./determinations.md) for how
those events tie into determination recording and notifications).
</content>
