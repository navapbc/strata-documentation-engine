# Verification findings: oscer-business-process (round 1)

- **Doc:** `docs/sources/oscer/business-process.md`
- **Source checkout:** `.sources/oscer`
- **Verifier round:** 1

---

## Status: No findings

The doc is fully supported by the source. Every checked claim matches:

- Step constants and the three declarator kinds (`system_process`, `applicant_task`,
  `staff_task`) match `certification_business_process.rb` lines 5-31, including which
  staff tasks bind to which task classes.
- `start(EXTERNAL_EXEMPTION_CHECK_STEP, on: "CertificationCreated")` building a
  `CertificationCase` from `event[:payload][:certification_id]` — matches lines 34-36.
- All transition declarations in the doc (exemption check, CE check, activity report,
  exemption claim, denial response) match lines 39-68 verbatim.
- CE outcome semantics — Met (either track compliant), Insufficient (some external
  hours on file), ActionRequired (no external hours) — match
  `community_engagement_check_service.rb` lines 53-61.
- Event publishing sources: service-published events (`ExemptionDeterminationService`,
  `CommunityEngagementCheckService`) and `CertificationCase` domain methods
  (`accept_activity_report`→ActivityReportApproved, `deny_activity_report`→
  Denied/DeniedFinal, `accept_exemption_request`→DeterminedExempt,
  `deny_exemption_request`→DeterminedNotExempt, denial-response methods→
  Approved/Denied/DeniedFinal) — all match `certification_case.rb` lines 75-184.
- Verification-window split (`verification_window_ended?`) driving Final vs non-Final
  denial events — matches lines 99-100, 182-183.
- `NotificationsEventListener` as a decoupled subscriber — matches source comment
  (line 17) and CLAUDE.md.
- Review task classes subclass `OscerTask` — confirmed in the three
  `review_*_task.rb` model files.
