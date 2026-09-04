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
  - example-oscer-verification-data-sources
demonstrates: [business-process, case]
summary: How OSCER models the Medicaid certification lifecycle as a Strata::BusinessProcess state machine driving a Strata::Case aggregate.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/oscer_application_form.rb
    - reporting-app/app/services/community_engagement_check_service.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/services/notifications_event_listener.rb
last_documented: 2026-09-04
verified: ok
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
  system_process(EXTERNAL_EXCLUSION_CHECK_STEP, ->(kase) {
    ExclusionDeterminationService.determine(kase)
  })
  system_process(EXTERNAL_EXCEPTION_CHECK_STEP, ->(kase) {
    ExceptionDeterminationService.determine(kase)
  })
  system_process(EXTERNAL_COMMUNITY_ENGAGEMENT_CHECK_STEP, ->(kase) {
    CommunityEngagementCheckService.determine(kase)
  })
  # Trailing step: where OSCER calls OUT, after the preceding steps assess data in hand.
  system_process(VERIFICATION_DATA_SOURCE_CHECK_STEP, ->(kase) {
    DataSourceCheckService.determine(kase)
  })

  # Human task steps
  applicant_task(REPORT_ACTIVITIES_STEP)
  staff_task(REVIEW_ACTIVITY_REPORT_STEP, ReviewActivityReportTask)
  staff_task(REVIEW_EXEMPTION_CLAIM_STEP, ReviewExemptionClaimTask)
  staff_task(REVIEW_DENIAL_RESPONSE_STEP, ReviewDenialResponseTask)

  # Entry point: a CertificationCreated event starts the process and builds the case
  start(EXTERNAL_EXCLUSION_CHECK_STEP, on: "CertificationCreated") do |event|
    CertificationCase.new(certification_id: event[:payload][:certification_id])
  end

  # Event-driven transitions between steps
  transition(EXTERNAL_EXCLUSION_CHECK_STEP, "DeterminedNotExcluded", EXTERNAL_EXCEPTION_CHECK_STEP)
  transition(EXTERNAL_EXCLUSION_CHECK_STEP, "DeterminedExcluded", END_STEP)
  # ...
end
```

The flow as declared:

1. **Start** — `CertificationCreated` (published by `Certification.after_create_commit`) starts the
   process at the external exclusion check and constructs a `CertificationCase` bound to the
   certification id.
2. **External exclusion check** (`system_process`) — runs `ExclusionDeterminationService.determine`.
   `DeterminedExcluded` and `DeterminedExcepted` end the case; `DeterminedNotExcluded` advances to
   the exception check. (The step can emit an exception outcome because it lets the verification data
   sources improve on the rules engine's verdict — see [rules engine](./rules-engine.md).)
3. **External exception check** (`system_process`) — runs `ExceptionDeterminationService.determine`.
   `DeterminedExcepted` ends the case (the member need not report); `DeterminedNotExcepted` advances
   to the CE check.
4. **External community-engagement check** (`system_process`) — runs
   `CommunityEngagementCheckService.determine`, which aggregates the hours and income already in
   hand (inbound-pushed plus member-reported). `DeterminedCommunityEngagementMet` ends the case;
   `DeterminedCommunityEngagementNotMet` advances to the verification-data-source check.
5. **Verification data source check** (`system_process`) — runs `DataSourceCheckService.determine`,
   the trailing step where OSCER calls out to external sources. `DeterminedExcepted` and
   `DeterminedCommunityEngagementMet` end the case;
   `DeterminedCommunityEngagementInsufficient` and `DeterminedCommunityEngagementActionRequired`
   route to the member's report-activities step. See
   [verification data sources](./verification-data-sources.md).
6. **Report activities** (`applicant_task`) — the member submits one of three application forms.
   Each form's submission event (`ActivityReportApplicationFormSubmitted`,
   `ExemptionApplicationFormSubmitted`, `DenialResponseApplicationFormSubmitted`) transitions to the
   matching staff review step.
7. **Staff review** (`staff_task` × 3) — a caseworker approves/denies. Every approval event
   (`ActivityReportApproved`, `DeterminedExempt`, `DenialResponseApproved`) ends the case. Denials
   differ by review: for the activity-report and denial-response reviews, a denial while the
   verification window is open returns the member to report-activities (`ActivityReportDenied`,
   `DenialResponseDenied`) and a `…Final` denial ends the case
   (`ActivityReportDeniedFinal`, `DenialResponseDeniedFinal`). The exemption-claim review has no
   `…Final` variant — `deny_exemption_request` always `save!`s and publishes `DeterminedNotExempt`
   with no `verification_window_ended?` check, so an exemption denial always routes back to
   report-activities.

Two things worth reading off the transition table:

- A **denial while the verification window is open** returns the member to `report_activities` (e.g.
  `ActivityReportDenied`), whereas a **final denial** (`ActivityReportDeniedFinal`) ends the case.
  The two event names are emitted by the case model depending on window state (see below).
- `DeterminedCommunityEngagementNotMet` is an **internal routing event only**: the source comments
  that it has no `NotificationsEventListener` subscription, so a member is not told they fell short
  before the outbound data sources have been consulted.

"Excluded", "excepted", and "exempt" are three distinct outcomes in this flow and are not
interchangeable.

## The case aggregate

`CertificationCase < Strata::Case` (`app/models/certification_case.rb`) is the per-process state
carrier. It relies on SDK-provided columns documented inline (`certification_id`, `status` with the
`open`/`closed` enum, `business_process_current_step`, and a `facts` jsonb column) and adds
app-specific state via `store_accessor :facts`:

```ruby
class CertificationCase < Strata::Case
  store_accessor :facts, :activity_report_approval_status, :activity_report_approval_status_updated_at,
    :exemption_request_approval_status, :exemption_request_approval_status_updated_at,
    :denial_response_approval_status, :denial_response_approval_status_updated_at
```

The case exposes two families of state-mutating methods. The caseworker-facing transitions
(`accept_activity_report`, `deny_activity_report`, `accept_exemption_request`,
`accept_denial_response`, etc.) each run inside a `transaction`, flip the relevant approval-status
accessor, call the SDK's `close!`/`save!`, and then publish the next workflow event directly. The
automated `record_*` methods (`record_exclusion_determination`, `record_exception_determination`,
`record_hours_compliance`, `record_income_compliance`, `record_data_source_ce_determination`,
`record_external_ce_combined_assessment`), invoked by the determination services, only mutate case
state inside the `transaction` — the calling service publishes the event and sends notifications.
Some of these do not flip an accessor at all (e.g. `record_exception_determination` only `close!`s).
Most methods in both families also record a `Determination` on the `Certification` (the
exemption-denial path instead writes a `Strata::AuditLog` entry):

```ruby
def deny_activity_report(user, application_form)
  certification = Certification.find(certification_id)
  hours_data = HoursComplianceDeterminationService.aggregate_hours_for_certification(certification, application_form:)

  transaction do
    self.activity_report_approval_status = "denied"
    self.activity_report_approval_status_updated_at = Time.current
    verification_window_ended? ? close! : save!
    certification.record_determination!(decision_method: :manual, outcome: :not_compliant, # ...
  end

  # window state selects which event (and therefore which transition/notification) fires
  event_name = verification_window_ended? ? "ActivityReportDeniedFinal" : "ActivityReportDenied"
  Strata::EventManager.publish(event_name, { case_id: id, certification_id:, application_form_id: application_form.id })
end
```

The automated CE recorders share one private helper, `record_automated_ce_compliance`, whose
`close_on_compliant:` keyword (default `true`) decides whether a `:compliant` outcome `close!`s the
case in the same transaction as the determination — so a compliant member drops out of the open-case
queues however the compliance was established (in-hand hours, in-hand income, or a data source's
attestation).

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
