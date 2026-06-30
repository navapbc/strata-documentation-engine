# Verification findings: example-oscer-application-forms (round 2)

Doc: `docs/sources/oscer/application-forms.md`  
Source: `.sources/oscer` (commit a4fc94b35ed737d20ca4530efe20d579ce5f0d53)

## Finding 1 (medium) — `flow_status` does not use FormApprovalStatus methods

**Claim** (lines 128-130):
> A form whose review task is still undecided reports `nil` — distinguishable from `approved`/`denied` — which `flow_status` uses to decide whether to show the form's own status or the case-level approval status.

**Issue**:
The doc claims that `flow_status` uses the `approval_status` method (from the FormApprovalStatus concern) to decide whether to show the form's own status or case-level approval status. However, the actual implementation of `flow_status` in all three forms does NOT call `approval_status`. Instead, it checks if the associated review task's status is `:completed`. If completed, it reads the case-level approval status; otherwise, it returns the form's own `status`. The `approval_status` method IS used in the codebase, but in the `activity_report_display_status` helper method, not in `flow_status`.

**Severity**: medium

**Evidence**:
- ActivityReportApplicationForm.flow_status (lines 67-80): calls `ReviewActivityReportTask.where(..., status: :completed).exists?` — does not call `approval_status`
- ExemptionApplicationForm.flow_status (lines 34-45): calls `staff_exemption_review_complete?` which queries for task status `:completed` — does not call `approval_status`
- DenialResponseApplicationForm.flow_status (lines 25-38): calls `ReviewDenialResponseTask.where(..., status: :completed).exists?` — does not call `approval_status`
- FormApprovalStatus concern's `approval_status` method IS actually used in `activity_report_display_status` helper (app/helpers/activity_report_application_forms_helper.rb, lines 16-18): `form.approval_status || form.status`

**Suggested fix**:
Clarify that the FormApprovalStatus concern's methods provide a way to read the form's decided outcome from its review task without mutating the form itself. Rather than attributing usage to `flow_status`, attribute it to where it's actually used: the `activity_report_display_status` helper and similar display-layer code. For example: "The FormApprovalStatus concern's `approval_status`, `approved?`, and `denied?` methods delegate to the review task, returning `nil` when undecided — a pattern used in helper methods like `activity_report_display_status` to display the form's outcome without mutating it."
