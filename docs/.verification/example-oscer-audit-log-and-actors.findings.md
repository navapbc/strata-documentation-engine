# Verification findings: example-oscer-audit-log-and-actors (round 1)

Doc: docs/sources/oscer/audit-log-and-actors.md
Source: .sources/oscer

## Result: no findings

Every claim in the doc is supported by the source checkout.

Verified claims:
- `Strata::AuditLog.write!` in `Determinable#record_determination!` with
  `action: "case.#{determination_method}.#{determination_status}"`, `actor:`, `subject: self`,
  `data: { determination_id: determination.id }` — matches
  determinable.rb:70-75.
- `determined_by_id = actor.is_a?(User) ? actor.id : nil` — matches determinable.rb:51.
- `CertificationCase#deny_exemption_request` uses `write!` with `action: "case.exemption.denied"`,
  `subject: certification` — matches certification_case.rb:125-136.
- `ExemptionDeterminationService` uses `write!` with `action: "case.exemption.denied", actor: self,
  subject: certification` and includes `Strata::VirtualActor`, passes `self` to
  `record_exemption_determination` — matches exemption_determination_service.rb:3-25.
- `Strata::AuditLog.record(actor: current_user) do |log| ... log.add_line(action:
  "case.task_picked_up", subject: Certification.find(@task.case.certification_id), data: {...}) end`
  in `TasksController#assign` — matches tasks_controller.rb:31-40.
- `ExternalIncomeActivityService` uses `record` block around `update!`, `log.add_line(actor: self,
  action: "external_income_activity.create", ...)`, includes `Strata::VirtualActor` — matches
  external_income_activity_service.rb:10,35-54.
- `Strata::VirtualActor` included by ExemptionDeterminationService,
  CommunityEngagementCheckService, ExternalIncomeActivityService — confirmed in all three service
  files.
- Method signatures `record_external_ce_combined_assessment(actor:, …)` and
  `record_exemption_determination(eligibility_fact, actor)` with `@param actor
  [Strata::VirtualActor]` annotations — match certification_case.rb:189-190, 257-263.
- Events via `Strata::EventManager.publish`/`subscribe`, `DeterminedExempt`,
  `ActivityReportApproved`, `NotificationsEventListener` — consistent with source usage in the
  service and case files.
