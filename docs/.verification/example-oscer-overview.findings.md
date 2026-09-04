# Verification findings: example-oscer-overview (round 2)

Doc: `docs/sources/oscer/overview.md`
Source: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257` (matches `source_ref.ref`)

## Status: All findings from round 1 have been fixed

Both issues identified in round 1 verification have been resolved in the current document:

1. **Fixed**: The table row (line 59) now correctly labels tasks as "Tasks (applicant / staff)"
   without the erroneous "system" variant. The business process confirms only `applicant_task` and
   `staff_task` exist (`certification_business_process.rb:43-47`).

2. **Fixed**: Lines 91-93 now correctly state: "`NotificationsEventListener` subscribes to the
   member-facing subset of those events and sends the member email; internal routing events such as
   `DeterminedCommunityEngagementNotMet` intentionally have no subscription." This accurately
   reflects the behavior shown in `notifications_event_listener.rb:35-47`.

## Full verification (round 2)

### All major claims verified as accurate:

- Four `system_process` determination steps and the trailing `verification_data_source_check`
  match `certification_business_process.rb:5-40`, including OSCER-805 "calls out last" framing.
- `Certification` includes `Determinable` and publishes `CertificationCreated` in `after_create_commit`
  (exact match to `app/models/certification.rb:24-26`).
- Every file path in the feature table exists with correct class hierarchies.
- Value objects (`Member`, `MemberStatus`, `DocAiResult`) all extend `Strata::ValueObject`.
- All claimed attribute types present: `:money`, `:year_month`, `:us_date`, `:name`, `:tax_id`,
  `range: true`, `array: true`.
- SDK view components extend correct Strata base classes.
- Audit log + virtual actors: `Determinable#record_determination!` calls `Strata::AuditLog.write!`;
  services use `Strata::VirtualActor`.
- `DocAiAdapter` posts to `v1/documents`.
- Platform integrations valid (`template-application-rails` and `documentai-api` in registry).
- All related doc ids and feature doc references exist.
- Source ref commit hash matches checkout.
- All out-of-scope systems correctly identified.

## Findings

No new findings. The document is fully accurate and supported by the source checkout.
