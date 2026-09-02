# Verification findings: example-oscer-business-process (round 2)

Doc: `docs/sources/oscer/business-process.md`
Source: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750`

## Summary

**No findings.** The document accurately describes the source code. Round 1's finding about
over-generalized claims regarding event publishing has been fully addressed by restructuring
the case-model section to clearly separate caseworker-facing transitions (which publish events)
from automated record_* methods (which only mutate state; services publish events). All major
claims verified against source.

## Verification completed

### Business process flow ✓
- CertificationCreated event published by Certification.after_create_commit (Certification line 22-24)
- All system_process, applicant_task, staff_task declarations match exactly
- All transition event names and routing correct
- Exclusion/exception/CE event logic matches service implementations
- Denial window conditional logic (ActivityReportDenied vs ActivityReportDeniedFinal) verified

### Case aggregate ✓
- Inherits from Strata::Case with documented columns
- store_accessor fields match exactly (lines 16-18 of certification_case.rb)
- No ActiveRecord association to Certification; attr_accessor pattern verified
- By_region scope and open_certification_id_for_member method verified

### Two families of methods (restructured from round 1) ✓
**Caseworker-facing transitions:**
- accept_activity_report, deny_activity_report, accept_exemption_request, 
  accept_denial_response, deny_denial_response: each runs transaction, flips accessor, 
  calls close!/save!, publishes event
- All verified with Strata::EventManager.publish calls (lines 75, 100, 122, 159, 183)

**Automated record_* methods:**
- record_exclusion_determination, record_exception_determination, record_hours_compliance,
  record_income_compliance, record_external_ce_combined_assessment: only mutate state in
  transaction, no event publishing
- Services (ExclusionDeterminationService, ExceptionDeterminationService,
  CommunityEngagementCheckService) publish events separately
- Document split correctly addresses round 1 finding

### Determination recording ✓
- Most methods record Determination on Certification
- Exception: deny_exemption_request writes Strata::AuditLog (line 132) instead
- Doc accurately notes: "the exemption-denial path instead writes a Strata::AuditLog entry"

### Verification window ✓
- VERIFICATION_WINDOW_DURATION_DAYS = 30 (line 34)
- open_verification_window stamps start/end dates (lines 310-319)
- verification_window_ended? gates denial outcomes (lines 321-323)
- Application forms validate on create (OscerApplicationForm lines 92-93)

### Code examples ✓
- deny_activity_report example is appropriately simplified/truncated to show key pattern
- Actual code includes additional parameters (reasons, determination_data, etc.) not shown
