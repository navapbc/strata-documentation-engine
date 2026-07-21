---
id: example-oscer-audit-log-and-actors
title: OSCER — audit log and virtual actors
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, audit-log, virtual-actor, events]
related:
  - example-oscer-overview
  - example-oscer-determinations
  - example-oscer-rules-engine
  - example-oscer-tasks
demonstrates: [audit-log, virtual-actor]
summary: How OSCER writes Strata::AuditLog entries (write!, record block, add_line) and attributes system-initiated actions to Strata::VirtualActor services.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/services/external_income_activity_service.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/services/exception_determination_service.rb
    - reporting-app/app/services/community_engagement_check_service.rb
last_documented: 2026-07-21
---

# OSCER — audit log and virtual actors

OSCER records an audit trail for every consequential action with `Strata::AuditLog`, and attributes
system-initiated actions (automated determinations, intake) to virtual actors via
`Strata::VirtualActor`.

## Audit log

The SDK's audit log is used in two forms across the app.

**`Strata::AuditLog.write!`** — a single audit line. The `Determinable` concern writes one for every
determination (`app/models/concerns/determinable.rb`):

```ruby
Strata::AuditLog.write!(
  action: "case.#{determination_method}.#{determination_status}",
  actor:,
  subject: self,
  data: { determination_id: determination.id }
)
```

`CertificationCase#deny_exemption_request` and the exclusion/exception services use the same `write!`
form (e.g. `action: "case.exemption.denied"`, `action: "case.exclusion.denied"`,
`action: "case.exception.denied"`, `subject: certification`).

**`Strata::AuditLog.record do |log| … end`** — a block that groups one or more lines added with
`log.add_line`. `TasksController` wraps task assignment so each pick-up is audited
(`app/controllers/tasks_controller.rb`):

```ruby
Strata::AuditLog.record(actor: current_user) do |log|
  if @task.assign(current_user.id)
    log.add_line(
      action: "case.task_picked_up",
      subject: Certification.find(@task.case.certification_id),
      data: { task_id: @task.id, task_type: @task.type }
    )
  end
end
```

`ExternalIncomeActivityService` uses the same block form around an intake `update!`, adding a line
with `actor: self` (the service is a virtual actor — see below) and
`action: "external_income_activity.create"`.

Across these call sites, `action` is a dotted domain string, `subject` is the audited aggregate
(`Certification`, the case, or the created record), `actor` is either a `User` or a virtual actor,
and `data` carries structured context.

## Virtual actors

System-initiated work has no logged-in user, so the services that perform automated determinations
and intake mix in `Strata::VirtualActor` and pass `self` as the actor:

```ruby
class ExclusionDeterminationService
  include Strata::VirtualActor
  # ...
  if eligibility_fact.value
    # excluded: record the determination with `self` as the virtual actor
    kase.record_exclusion_determination([ highest_priority_reason_code(eligibility_fact) ], self)
  else
    # not excluded: audit the denial instead (separate if/else branch)
    Strata::AuditLog.write!(action: "case.exclusion.denied", actor: self, subject: certification)
  end
end
```

`Strata::VirtualActor` is included by `ExclusionDeterminationService`, `ExceptionDeterminationService`,
`CommunityEngagementCheckService`, and `ExternalIncomeActivityService`. The case model documents the
contract in its method signatures — e.g. `record_external_ce_combined_assessment(actor:, …)`,
`record_exclusion_determination(reason_codes, actor)`, and `record_exception_determination(reason_codes,
actor)` all annotate `actor` as `[Strata::VirtualActor]`.

In `Determinable#record_determination!`, the actor type is used to decide attribution: a `User`
actor sets `determined_by_id`, while a virtual actor leaves it `nil`:

```ruby
determined_by_id = actor.is_a?(User) ? actor.id : nil
```

So a determination recorded by a virtual-actor service is stored without a `determined_by_id` but is
still audited (with the virtual actor as the audit `actor`), giving a complete trail for both
human-driven and system-driven decisions.

## Events vs. audit log

Note these are distinct mechanisms. State-transition propagation uses
`Strata::EventManager.publish`/`subscribe` (e.g. `DeterminedExcluded`, `DeterminedExcepted`,
`DeterminedCommunityEngagementMet`, `ActivityReportApproved`), which the business process transitions
and `NotificationsEventListener` consume. The audit log is the durable record of *who did what to
which subject*. Many transition methods do both: publish the workflow event and write an audit line.
(`Strata::EventManager` is intentionally treated as app-private surface and is documented here only
in context, not as a standalone SDK feature.)
