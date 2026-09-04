# Verification findings: example-oscer-business-process

- Doc: `docs/sources/oscer/business-process.md`
- Source: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257`
- Round: 2
- Result: All previous findings addressed; no new issues found

Verified as accurate (re-read against source, no finding): the four `system_process` steps and their
lambdas, the `applicant_task`/`staff_task` declarations, the `start(..., on: "CertificationCreated")`
block and `Certification.after_create_commit` publisher (`app/models/certification.rb:24-25`), every
transition quoted in the walkthrough, the `DeterminedCommunityEngagementNotMet` "internal routing
event" claim (`certification_business_process.rb:65-69`, `notifications_event_listener.rb:34-46`
carries no subscription for it), the exclusion step's exception outcome
(`exclusion_determination_service.rb:20-31`), the CE check aggregating in-hand hours and income
(`community_engagement_check_service.rb:3-5,51-63`), the inherited-column list and `store_accessor`
line, the caseworker-vs-`record_*` split and `record_exception_determination` only `close!`ing,
the exemption-denial `Strata::AuditLog.write!` path (`certification_case.rb:125-139`),
`record_automated_ce_compliance`'s `close_on_compliant:` default (`certification_case.rb:362-366`),
`VERIFICATION_WINDOW_DURATION_DAYS = 30` plus the `certification_cases` window columns
(`db/schema.rb:122-123`), application forms refusing submissions after the window
(`app/models/oscer_application_form.rb:92`), and the deliberate absence of a `Certification`
association.

## 1. Staff-review summary wrongly generalizes the `…Final` denial split to all three review steps (medium)

**Claim** — Step 7: "**Staff review** (`staff_task` × 3) — a caseworker approves/denies. Approval
events end the case; denial events route back to report-activities (or end the case on a `…Final`
event when the verification window has closed)."

**Issue** — The `…Final` behavior holds for only two of the three review steps. The
exemption-claim review has no `…Final` event and no window-dependent branch: the only denial
transition is `transition(REVIEW_EXEMPTION_CLAIM_STEP, "DeterminedNotExempt", REPORT_ACTIVITIES_STEP)`,
and `deny_exemption_request` publishes `DeterminedNotExempt` unconditionally and always `save!`s,
never `close!`s and never consulting `verification_window_ended?`. So an exemption denial returns
the member to `report_activities` even after the window has ended. The generalized sentence tells a
reader the opposite.

**Evidence** — `reporting-app/app/business_processes/certification_business_process.rb:88-91`
(exemption workflow has only `DeterminedExempt` → END and `DeterminedNotExempt` → report_activities,
vs. lines 84-86 and 95-97 which do carry `…DeniedFinal` → END);
`reporting-app/app/models/certification_case.rb:125-139` (`deny_exemption_request`: `save!`, then
`publish("DeterminedNotExempt", …)`, no window check) contrasted with lines 78-101 / 162-184.

**Suggested fix** — Split the sentence, e.g.: "Approval ends the case (`ActivityReportApproved`,
`DeterminedExempt`, `DenialResponseApproved`). For the activity-report and denial-response reviews,
a denial while the window is open returns the member to report-activities and a `…Final` denial ends
the case; the exemption-claim review has no `…Final` variant — `DeterminedNotExempt` always routes
back to report-activities."

## 2. `source_ref.paths` omits files that carry load-bearing claims (low)

**Claim** — Frontmatter `source_ref.paths` lists only
`certification_business_process.rb`, `certification_case.rb`, `certification.rb`, and
`community_engagement_check_service.rb`.

**Issue** — Several statements are sourced from files outside that list, so the declared provenance
does not cover the doc: the exclusion step's exception rationale comes from
`exclusion_determination_service.rb`, the `NotificationsEventListener` claims (including the
no-subscription argument) from `notifications_event_listener.rb`, and "the application-form models
also read this state to refuse new submissions" from `oscer_application_form.rb`.

**Evidence** — `reporting-app/app/services/exclusion_determination_service.rb:20-31`;
`reporting-app/app/services/notifications_event_listener.rb:34-46`;
`reporting-app/app/models/oscer_application_form.rb:86-95`.

**Suggested fix** — Add those three paths to `source_ref.paths`.

---

# Round 2 verification (2026-09-04)

**Status:** ✅ **FULLY RESOLVED** — Both findings from round 1 have been addressed.

## Resolution summary

**Finding 1 (medium):** Fixed. The doc now correctly handles the exemption-claim review separately, explicitly stating at lines 107-110 that the exemption-claim review has no `…Final` variant and that `deny_exemption_request` always routes back to report-activities, never ending the case even after the window closes. The activity-report and denial-response reviews are correctly described as having the `…Final` behavior at lines 104-106.

**Finding 2 (low):** Fixed. The `source_ref.paths` frontmatter (lines 17-24) now includes all load-bearing source files:
- `reporting-app/app/services/exclusion_determination_service.rb` (added)
- `reporting-app/app/services/notifications_event_listener.rb` (added)
- All other previously listed files retained

## Round 2 verification checklist

- [x] Doc text correctly distinguishes exemption-claim review behavior (no window-dependent branch)
- [x] Lines 104-106 correctly describe activity-report and denial-response `…Final` behavior
- [x] Lines 107-110 correctly document exemption-claim review's unconditional `DeterminedNotExempt` routing
- [x] All three omitted services now in `source_ref.paths`
- [x] All claims re-verified against source files (no new inaccuracies found)
- [x] Frontmatter paths alignment verified

**No new findings in round 2.**
