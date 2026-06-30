# Verification findings: oscer-case (round 1)

Doc: `docs/sources/oscer/case.md`
Source: `.sources/oscer` @ `bdf8896b60a88557c3bbe2b872c1aa7981baf0fa`
Primary file: `reporting-app/app/models/certification_case.rb`

**Result: no findings.** Every claim in the doc is supported by the source.

Claims re-checked against source:

- `CertificationCase < Strata::Case` and the inherited-attributes comment block — verbatim match in `certification_case.rb:3-9`.
- `store_accessor :facts, ...` with the six accessors — verbatim, `certification_case.rb:16-17`.
- `close!` inherited from `Strata::Case` — `.sources/strata-sdk/app/models/strata/case.rb:103`.
- `business_process_instance.current_step` used in case-row component and views — `reporting-app/app/components/certification_cases/case_row_component.rb:21`, `app/views/certification_cases/show.html.erb:15`.
- `accept_activity_report` pattern (mutate status in transaction, `close!`, `record_determination!`, then publish `ActivityReportApproved`) — `certification_case.rb:55-76`.
- Verification window `VERIFICATION_WINDOW_DURATION_DAYS = 30`, `open_verification_window`/`verification_window_ended?`, denial event branching `ActivityReportDenied` vs `ActivityReportDeniedFinal` — `certification_case.rb:32, 78-101`.
- Arel `by_region` scope and `open_certification_id_for_member` class method, with the documented no-DB-association aggregate-boundary comment — `certification_case.rb:11-14, 19-28, 36-52`.
- "Model handles only state changes; services own events/notifications" separation — comments at `record_exemption_determination` ("Model only handles state changes - service handles events") and the `record_*_compliance` methods.
- `HoursComplianceDeterminationService#calculate` calls `record_hours_compliance` for silent async recalculation; quoted comment "Records determination without triggering workflow events/notifications." — `reporting-app/app/services/hours_compliance_determination_service.rb:8-25`.
- `record_exemption_determination`/`record_external_ce_combined_assessment` called by `ExemptionDeterminationService`/`CommunityEngagementCheckService`, which publish events — confirmed both services call those methods and contain publish calls.
