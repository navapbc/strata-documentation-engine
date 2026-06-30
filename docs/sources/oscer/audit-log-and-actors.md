---
id: example-oscer-audit-log-and-actors
title: OSCER — audit log and virtual actors
source: oscer
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
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/services/external_income_activity_service.rb
    - reporting-app/app/services/exemption_determination_service.rb
    - reporting-app/app/services/community_engagement_check_service.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — audit log and virtual actors

OSCER records an audit trail for every consequential action with `Strata::AuditLog`, and attributes
system-initiated actions (automated determinations, intake) to virtual actors via
`Strata::VirtualActor`.

## Audit log

The SDK's audit log is used in three forms across the app.

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

`CertificationCase#deny_exemption_request` and `ExemptionDeterminationService` use the same `write!`
form (e.g. `action: "case.exemption.denied"`, `subject: certification`).

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
class ExemptionDeterminationService
  include Strata::VirtualActor
  # ...
  kase.record_exemption_determination(eligibility_fact, self)   # `self` is the virtual actor
  Strata::AuditLog.write!(action: "case.exemption.denied", actor: self, subject: certification)
end
```

`Strata::VirtualActor` is included by `ExemptionDeterminationService`,
`CommunityEngagementCheckService`, and `ExternalIncomeActivityService`. The case model documents the
contract in its method signatures — e.g. `record_external_ce_combined_assessment(actor:, …)` and
`record_exemption_determination(eligibility_fact, actor)` annotate `actor` as
`[Strata::VirtualActor]`.

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
`Strata::EventManager.publish`/`subscribe` (e.g. `DeterminedExempt`, `ActivityReportApproved`),
which the business process transitions and `NotificationsEventListener` consume. The audit log is the
durable record of *who did what to which subject*. Many transition methods do both: publish the
workflow event and write an audit line. (`Strata::EventManager` is intentionally treated as
app-private surface and is documented here only in context, not as a standalone SDK feature.)
</content>
