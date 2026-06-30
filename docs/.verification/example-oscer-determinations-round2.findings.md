# Verification findings: example-oscer-determinations (round 2)

Doc: `docs/sources/oscer/determinations.md`
Source: `.sources/oscer` @ a4fc94b35ed737d20ca4530efe20d579ce5f0d53

## Result

**No findings.** All claims in the doc are accurate and well-supported by the source code.

### Verification summary

**Round 1 finding (now resolved)**: The doc previously claimed that hours/income compliance services included `Strata::VirtualActor`, which was inaccurate. This has been corrected in lines 119-122 to properly distinguish:
- `ExemptionDeterminationService` and `CommunityEngagementCheckService` DO include `Strata::VirtualActor` and pass it as an actor
- `record_hours_compliance` / `record_income_compliance` record with `actor: nil`

**Key claims verified**:
1. ✓ `Determination < Strata::Determination` with required field validations and polymorphic subject association
2. ✓ `REASON_CODE_MAPPING` hash with correct keys (age_under_19, income_reported_compliant, hours_reported_compliant, etc.)
3. ✓ Enums for `decision_method` ({automated, manual}) and `outcome` ({compliant, exempt, not_compliant})
4. ✓ Validation requiring `reasons` presence and inclusion in `VALID_REASONS`
5. ✓ `latest_per_subject` scope using `DISTINCT ON (subject_id)`
6. ✓ Determination value objects (HoursBasedDeterminationData, IncomeBasedDeterminationData, ExternalCECombinedDeterminationData)
7. ✓ Issue #680 gotcha about `determination_data` must stay a Hash (documented in certification_case.rb:203-208)
8. ✓ `Determinable` concern wraps `Strata::Determinable` (certification.rb:7)
9. ✓ `record_determination!` translates actor to `determined_by_id` and writes audit log (determinable.rb:50-76)
10. ✓ Audit log action structure: `"case.{determination_method}.{determination_status}"` where determination_method is derived from reasons and determination_status from outcome
11. ✓ CertificationCase calls record_determination! in: accept_activity_report, deny_activity_report, accept_exemption_request, accept_denial_response, record_exemption_determination, record_hours_compliance, record_income_compliance, record_external_ce_combined_assessment
12. ✓ ExemptionDeterminationService includes Strata::VirtualActor (exemption_determination_service.rb:4)
13. ✓ CommunityEngagementCheckService includes Strata::VirtualActor (community_engagement_check_service.rb:8)
14. ✓ HoursComplianceDeterminationService does NOT include Strata::VirtualActor (no virtual actor for hours/income compliance)
15. ✓ Example code for manual approval matches source exactly (certification_case.rb:65-72)

All code examples, technical details, and API signatures are accurate.
