# Verification findings: oscer-audit-log (round 1)

Doc: `docs/sources/oscer/audit-log.md`
Source: `.sources/oscer`

## Summary

No findings. The doc is fully supported by the source.

## Claims verified

- **Single-line `write!`** (doc lines 36-45):
  - `Strata::AuditLog.write!(action: "case.#{determination_method}.#{determination_status}", actor:, subject: self, data: { determination_id: determination.id })`
    matches `reporting-app/app/models/concerns/determinable.rb:70-75`.
  - `Strata::AuditLog.write!(action: "case.exemption.denied", actor: user, subject: certification)`
    in `deny_exemption_request` matches `reporting-app/app/models/certification_case.rb:132-136`.

- **Block form `record` / `log.add_line`** (doc lines 53-70):
  - `tasks_controller.rb#assign` block (doc lines 57-66) matches `reporting-app/app/controllers/tasks_controller.rb:31-40`.
  - "`pick_up_next_task` uses the same pattern" confirmed at `tasks_controller.rb:53-67`.

- **Virtual actors — `ExemptionDeterminationService`** (doc lines 77-87):
  - `include Strata::VirtualActor`, `class << self`, and `Strata::AuditLog.write!(action: "case.exemption.denied", actor: self, ...)` match `reporting-app/app/services/exemption_determination_service.rb:3-24`.

- **Per-service audit/determination breakdown** (doc lines 92-102):
  - `ExternalIncomeActivityService` uses `self` only as the audit actor in its `record` block (`log.add_line(actor: self, ...)`) — confirmed at `external_income_activity_service.rb:35-54`.
  - The income compliance determination it triggers is recorded with no actor (`actor: nil`): traced `external_income_activity_service.rb:56,65-69` → `income_compliance_determination_service.rb:41` → `certification_case.rb:243-251` (`record_income_compliance`, no actor) → `certification_case.rb:310,316-323` (`record_automated_ce_compliance` defaults `actor: nil`). Accurate.
  - `ExemptionDeterminationService` uses `self` as both audit actor and determination actor via `record_exemption_determination(eligibility_fact, self)` — confirmed at `exemption_determination_service.rb:15, 18-23`.
  - `CommunityEngagementCheckService` records no direct audit line and uses `self` only as the determination actor via `record_external_ce_combined_assessment(actor: self, ...)` — confirmed at `community_engagement_check_service.rb:23-30` (no `Strata::AuditLog` call in the service).

- **`actor.is_a?(User)` branch and `decision_method`** (doc lines 106-116):
  - `determined_by_id = actor.is_a?(User) ? actor.id : nil` matches `determinable.rb:51`.
  - The doc states this is the only value derived from the actor type; `decision_method:` is a caller-supplied keyword — confirmed: `determinable.rb:50,52-59` forwards `decision_method:` unchanged to `super`.
  - `decision_method: :automated` hard-coded by `record_exemption_determination` (`certification_case.rb:200`) and `record_automated_ce_compliance` (`certification_case.rb:317`). Accurate.

- **`ExternalIncomeActivityService` block-form snippet** (doc lines 122-126):
  - Snippet shows `Strata::AuditLog.record do |log|` (no top-level `actor:`), `entry.update!(...)`, and `log.add_line(actor: self, ...)` — matches `external_income_activity_service.rb:35-54` exactly.
