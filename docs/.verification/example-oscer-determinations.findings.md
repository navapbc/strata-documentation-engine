# Verification findings: example-oscer-determinations (round 1)

Doc: `docs/sources/oscer/determinations.md`
Source checkout: `.sources/oscer`

## Result: fully supported — no findings

Every claim in the doc was re-checked against the source and is accurate.

### Claims verified

- `Determination < Strata::Determination` with inherited polymorphic `subject`, required-field
  validations (`decision_method`, `reasons`, `outcome`, `determination_data`, `determined_at`), and
  query scopes — matches `reporting-app/app/models/determination.rb` (lines 5-9).
- `REASON_CODE_MAPPING` sample entries, `VALID_REASONS = REASON_CODE_MAPPING.values.freeze`, the
  `decision_method` and five-way `outcome` enums, `validates :reasons ... inclusion: { in: VALID_REASONS }`,
  and `scope :latest_per_subject` — all match `determination.rb` (lines 64-133). The
  "excluded/excepted/exempt are distinct" note matches the source comment (lines 83-84), and the
  `was_pregnant: "pregnancy_excepted"` example matches line 88.
- Value objects `HoursBasedDeterminationData` / `IncomeBasedDeterminationData` (`from_aggregate`) and
  `ExternalCECombinedDeterminationData` (`build`), each validated before write — confirmed in
  `reporting-app/app/models/determinations/*.rb`.
- Issue #680 gotcha (`determination_data` must stay a `Hash`; `reasons.to_json` double-encodes and
  500'd the dashboard) — matches the comment in `record_exclusion_determination`
  (`certification_case.rb` lines 202-207).
- `Determinable` concern wrapping `Strata::Determinable`, overriding `record_determination!` to map
  actor → `determined_by_id`, classify by outcome/reasons, and write an audit log — matches
  `reporting-app/app/models/concerns/determinable.rb` (lines 45-82). Code excerpt is faithful.
- `Certification include Determinable` — `reporting-app/app/models/certification.rb` line 7.
- Manual transition methods (`accept_activity_report`, `deny_activity_report`,
  `accept_exemption_request`, `accept_denial_response`, `deny_denial_response`) and automated ones
  (`record_exclusion_determination`, `record_exception_determination`, `record_hours_compliance`,
  `record_income_compliance`, `record_external_ce_combined_assessment`) all call
  `record_determination!` — confirmed in `certification_case.rb`. `deny_exemption_request` (which only
  writes an audit log, no determination) is correctly excluded.
- Manual approval example matches `accept_activity_report` (lines 65-72).
- Services `ExclusionDeterminationService`, `ExceptionDeterminationService`,
  `CommunityEngagementCheckService` `include Strata::VirtualActor` (verified via grep against
  `app/services/`) and pass a virtual actor; `record_hours_compliance` / `record_income_compliance`
  record with `actor: nil` — they do not pass `actor` to `record_automated_ce_compliance`, whose
  default is `nil` (`certification_case.rb` line 334). Accurate.

Note: an earlier findings file for this doc flagged an incorrect service list
(`ExemptionDeterminationService`); the current doc has been revised and now lists the correct three
services, all of which are confirmed to include `Strata::VirtualActor`.
