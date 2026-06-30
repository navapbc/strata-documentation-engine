# Verification findings: oscer-application-forms (round 1)

Doc: `docs/sources/oscer/application-forms.md`
Source: `.sources/oscer`

## Result

All material claims in the doc are supported by the source files:

- Three forms subclass `Strata::ApplicationForm` and `include FormApprovalStatus` — confirmed in all three model files.
- `has_review_task` is defined by OSCER's own `FormApprovalStatus` concern (in `class_methods`), declaring `has_one :review_task` — confirmed in `concerns/form_approval_status.rb`.
- `ActivityReportApplicationForm` and `ExemptionApplicationForm` define `information_request_class`; `DenialResponseApplicationForm` does not — confirmed.
- `event_payload` is overridden to `super.merge(case_id: certification_case_id)`, with the quoted `# Include the case id` comment matching `ActivityReportApplicationForm` — confirmed in all three.
- Creation guards `validate :case_not_closed, on: :create` and `validate :no_pending_forms, on: :create` present in all three — confirmed.
- `ActivityReportApplicationForm` reporting-period validations (length == `number_of_months_to_certify`, in-range against `months_that_can_be_certified`) — confirmed.
- Each form defines `flow_status` blending SDK `status` with case-level approval status once the review task is complete — confirmed.
- `FormApprovalStatus` supplies `approval_status`/`approved?`/`denied?` helpers — confirmed.
- `ExemptionApplicationForm` maps `exemption_type` enum via `Exemption.enum_hash`; `DenialResponseApplicationForm` is a `comment` (text) + supporting-documents form — confirmed.
- The code snippets quoted in the doc match the source verbatim.

No inaccurate, unsupported, or outdated statements found. Findings array is empty.
