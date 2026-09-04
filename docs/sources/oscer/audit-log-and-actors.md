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
  - example-oscer-verification-data-sources
  - example-oscer-tasks
demonstrates: [audit-log, virtual-actor]
summary: How OSCER writes Strata::AuditLog entries (write!, record block, add_line) and attributes system-initiated actions to Strata::VirtualActor services.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/controllers/tasks_controller.rb
    - reporting-app/app/services/external_income_activity_service.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/services/exception_determination_service.rb
    - reporting-app/app/services/community_engagement_check_service.rb
    - reporting-app/app/services/data_source_check_service.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — audit log and virtual actors

OSCER records an audit trail for consequential case actions with `Strata::AuditLog`, and attributes
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

Across these call sites, `action` is a dotted domain string, `subject` is either the `Certification`
aggregate root or the created record (never a `CertificationCase`), `actor` is either a `User` or a
virtual actor, and `data` carries structured context.

## Virtual actors

System-initiated work has no logged-in user, so the services that perform automated determinations
and intake mix in `Strata::VirtualActor` and pass `self` as the actor. These are class-method
services — each opens a `class << self` block — so the `self` they pass is the class itself, not an
instance. `Strata::AuditLine#actor=` accepts either, normalizing with
`klass = value.is_a?(Class) ? value : value.class` and leaving `actor_id` NULL: virtual-actor
identity is the class name only.

```ruby
class ExclusionDeterminationService
  include Strata::VirtualActor

  class << self
    def determine(kase)
      # ...
      if current_best
        # excluded: record the determination with `self` (the class) as the virtual actor
        kase.record_exclusion_determination([ reason_code(current_best[:key]) ], self, current_best[:source])
      elsif exceptions.any?
        # a data source emitted an exception instead
        kase.record_exception_determination([ reason_code(first[:key]) ], self, data_source: first[:source])
      else
        # no exclusion and no data-source exception: audit the denial
        Strata::AuditLog.write!(action: "case.exclusion.denied", actor: self, subject: certification)
      end
    end
  end
end
```

`Strata::VirtualActor` is included by `ExclusionDeterminationService`,
`ExceptionDeterminationService`, `CommunityEngagementCheckService`, `DataSourceCheckService`, and
`ExternalIncomeActivityService`. The case model documents the contract in its method signatures —
e.g. `record_external_ce_combined_assessment(actor:, …)`,
`record_exclusion_determination(reason_codes, actor, data_source)`, and
`record_exception_determination(reason_codes, actor, data_source: nil)` all annotate `actor` as
`[Strata::VirtualActor]`.

In `Determinable#record_determination!`, the actor type is used to decide attribution: a `User`
actor sets `determined_by_id`, while a virtual actor leaves it `nil`:

```ruby
determined_by_id = actor.is_a?(User) ? actor.id : nil
```

So a determination recorded by a virtual-actor service is stored without a `determined_by_id` but is
still audited (with the virtual actor as the audit `actor`), giving a complete trail for both
human-driven and system-driven decisions. Provenance the audit trail alone can't carry is recorded
separately on the determination: the automated writers pass a `data_source` into
`determination_data`, which `Determination#source` reads back (see
[determinations](./determinations.md)).

## Events vs. audit log

Note these are distinct mechanisms. State-transition propagation uses
`Strata::EventManager.publish`/`subscribe` (e.g. `DeterminedExcluded`, `DeterminedExcepted`,
`DeterminedCommunityEngagementMet`, `ActivityReportApproved`), which the business process transitions
and `NotificationsEventListener` consume. The audit log is the durable record of *who did what to
which subject*. Many transition methods do both: publish the workflow event and write an audit line.
The two are not interchangeable, and the app has at least one place where that matters: a
verification data source that **errors** is logged with `Rails.logger.warn` rather than an audit
line, and `DataSourceCheckService` flags that as a gap — the determination row it then writes is
indistinguishable from a clean negative (see
[verification data sources](./verification-data-sources.md)).

(`Strata::EventManager` is intentionally treated as app-private surface and is documented here only
in context, not as a standalone SDK feature.)
