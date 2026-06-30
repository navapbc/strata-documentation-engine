# Verification findings: example-oscer-determinations (round 1)

Doc: `docs/sources/oscer/determinations.md`
Source: `.sources/oscer` @ a4fc94b35ed737d20ca4530efe20d579ce5f0d53

## Finding 1 (medium): hours/income compliance services do not use a virtual actor

**Claim** (doc lines 119-122): "The automated determination services (`ExemptionDeterminationService`, `CommunityEngagementCheckService`, the hours/income compliance services) pass a virtual actor (`include Strata::VirtualActor`) instead of a `User`".

**Issue**: Only `ExemptionDeterminationService` (`app/services/exemption_determination_service.rb:4`) and `CommunityEngagementCheckService` (`app/services/community_engagement_check_service.rb:8`) `include Strata::VirtualActor`, and only the latter passes `actor: self` into a record call (`record_external_ce_combined_assessment(actor: self, ...)`, line 23-24). `HoursComplianceDeterminationService` and `IncomeComplianceDeterminationService` do NOT include `Strata::VirtualActor` at all, and their `calculate` methods call `kase.record_hours_compliance(outcome, hours_data)` / `kase.record_income_compliance(outcome, income_data)` with NO actor argument. Those `CertificationCase` methods feed `record_automated_ce_compliance(..., actor: nil)` (default, `certification_case.rb:310`), so hours/income determinations are recorded with `actor: nil` and `determined_by_id: nil` — no virtual actor is involved.

**Evidence**:
- `app/services/hours_compliance_determination_service.rb` — no `Strata::VirtualActor`; line 25 `kase.record_hours_compliance(outcome, hours_data)` (no actor)
- `app/services/income_compliance_determination_service.rb` — no `Strata::VirtualActor`; line 41 `kase.record_income_compliance(outcome, income_data)` (no actor)
- `app/models/certification_case.rb:310` — `record_automated_ce_compliance(..., actor: nil)`

**Severity**: medium — incorrectly attributes a `Strata::VirtualActor` mechanism to two services that do not use it.

**Suggested fix**: Narrow the claim to the services that actually use a virtual actor, e.g.: "The exemption and combined-CE services (`ExemptionDeterminationService`, `CommunityEngagementCheckService`) `include Strata::VirtualActor` and pass that virtual actor instead of a `User`; the standalone hours/income compliance recalculations (`record_hours_compliance`/`record_income_compliance`) record with no actor (`actor: nil`)."
