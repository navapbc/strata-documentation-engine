# Verification findings — example-oscer-audit-log-and-actors (round 1)

Doc: `docs/sources/oscer/audit-log-and-actors.md`
Source: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750` (SHA matches `source_ref.ref`)

## Verified claims (fully supported)

- `Strata::AuditLog.write!` block in `Determinable#record_determination!` matches
  `reporting-app/app/models/concerns/determinable.rb:74-79` exactly.
- `determined_by_id = actor.is_a?(User) ? actor.id : nil` — `determinable.rb:51`.
- `CertificationCase#deny_exemption_request` uses `write!` with `action: "case.exemption.denied"`,
  `subject: certification` — `certification_case.rb:125-136`.
- `case.exclusion.denied` / `case.exception.denied` `write!` calls with `subject: certification` —
  `exclusion_determination_service.rb:18-22`, `exception_determination_service.rb:43-47`.
- `Strata::AuditLog.record do |log| … end` block in `TasksController#assign` matches
  `tasks_controller.rb:31-40` exactly.
- `ExternalIncomeActivityService` uses the `record` block around an intake `update!`, adding a line
  with `actor: self` and `action: "external_income_activity.create"` —
  `external_income_activity_service.rb:35-54`.
- `Strata::VirtualActor` is included by all four named services (ExclusionDeterminationService,
  ExceptionDeterminationService, CommunityEngagementCheckService, ExternalIncomeActivityService) —
  verified in each service file.
- Method signatures annotate `actor` as `[Strata::VirtualActor]`:
  `record_external_ce_combined_assessment(actor:, …)` (`certification_case.rb:281,287`),
  `record_exclusion_determination(reason_codes, actor)` (`:189-190`),
  `record_exception_determination(reason_codes, actor)` (`:219-220`).
- Events section: `DeterminedExcluded`, `DeterminedExcepted`, `DeterminedCommunityEngagementMet`,
  `ActivityReportApproved` all exist; `NotificationsEventListener` subscribes to them
  (`notifications_event_listener.rb:37-44`) and `CertificationBusinessProcess` consumes them as
  transitions (`certification_business_process.rb:48-69`). `EventManager.publish` confirmed at the
  cited call sites.

## Findings

### 1. Virtual-actor snippet shows two branch-exclusive calls as sequential (low)

The illustrative code block under "Virtual actors" shows
`kase.record_exclusion_determination(..., self)` immediately followed by
`Strata::AuditLog.write!(action: "case.exclusion.denied", actor: self, ...)`. In the source
(`exclusion_determination_service.rb:14-24`) these are mutually exclusive branches:
`record_exclusion_determination` is in the `if eligibility_fact.value` path (line 15) and the
`write!` is in the `else` path (line 18). Presenting them adjacently can read as if both run in one
pass. The `# ...` elision softens this and the illustrated point (`self` as the virtual actor in
both call forms) is correct, so severity is low.

---

# Round 2 Verification (2026-07-21)

## Finding

### 1. Inaccurate count of audit log forms (medium)

**Claim** (line 36): "The SDK's audit log is used in three forms across the app."

**Issue**: The documentation introduces "three forms" in the opening sentence but only demonstrates
two distinct patterns throughout:

1. `Strata::AuditLog.write!(...)` — single audit line (lines 38–52)
2. `Strata::AuditLog.record do |log| ... end` — block form with `add_line` (lines 54–73)

Comprehensive search of `.sources/oscer/reporting-app/app` (non-test files) confirms only these two
patterns are used:
- `write!` calls: determinable.rb:74, certification_case.rb:132, exception_determination_service.rb:43, exclusion_determination_service.rb:18
- `record` blocks: tasks_controller.rb:31, tasks_controller.rb:53, external_income_activity_service.rb:35

No third form is documented, exemplified, or discovered in the source. The count should reflect the
actual patterns in use.

**Evidence**:
- Line 36 claims three; lines 38–73 enumerate two
- `grep -r "Strata::AuditLog" .sources/oscer/reporting-app/app --include="*.rb"` yields only write! and record patterns

**Suggested fix**: Change "three forms" to "two forms" on line 36, or identify and document a third
form if one exists.

---

# Round 3 Verification (2026-07-21)

## Status: ✅ RESOLVED

### Previous findings status

- **Round 1 finding (mutually exclusive branches)**: ✅ RESOLVED by clarifying comment
  - The code snippet at lines 82-94 now includes the comment `# not excluded: audit the denial instead (separate if/else branch)`, which makes the mutual exclusivity clear.

- **Round 2 finding (three forms vs. two forms)**: ✅ RESOLVED  
  - Line 36 correctly states "The SDK's audit log is used in **two forms** across the app." The inaccurate count has been corrected.

### New verification (Round 3)

Comprehensive re-verification of all major claims against `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750`:

**Verified**:
- `Strata::AuditLog.write!` usage in Determinable (determinable.rb:74-79) ✅
- `Strata::AuditLog.record` block form in TasksController (tasks_controller.rb:31-40, 53-66) ✅
- Action strings: "case.exemption.denied" (certification_case.rb:132), "case.exclusion.denied" (exclusion_determination_service.rb:18), "case.exception.denied" (exception_determination_service.rb:43) ✅
- ExternalIncomeActivityService block form (external_income_activity_service.rb:35-54) ✅
- Virtual Actor inclusion in all four services (exclusion, exception, community_engagement, external_income_activity) ✅
- Method signature annotations with `[Strata::VirtualActor]` (certification_case.rb:281, 189, 219) ✅
- `determined_by_id` logic (determinable.rb:51) ✅
- Event examples (exclusion_determination_service.rb:16, exception_determination_service.rb:41, community_engagement_check_service.rb:54, certification_case.rb:75) ✅

## Findings: None

The document is now fully accurate and well-supported by the source code. Previous findings have been resolved.
