# Verification findings: example-oscer-value-objects (round 1)

Doc: docs/sources/oscer/value-objects.md
Source: .sources/oscer (member.rb, member_status.rb)

## Findings

None. The doc is fully supported by the source.

### Verification notes
- `Member < Strata::ValueObject` with `strata_attribute :member_id/:email/:name` and the
  `from_certification`/`find_by_member_id`/`search_by_email` factory methods all match
  `reporting-app/app/models/member.rb` (lines 6-32).
- The `MemberStatus` value-object contract claims (excluded from `#attributes`, `#blank?`,
  `Strata::ValueObject#==`, JSON serialization; equality compares `attributes` only) match the
  source header comment in `member_status.rb` (lines 17-23) verbatim.
- `latest_determination` is a plain `attr_accessor`, not a `strata_attribute` (line 62) — matches.
- Status inclusion validation set and constants match (lines 42-46, 64-65).
- Derived query methods `dashboard_report_status` and `certification_period_completed?` exist
  (lines 69-83) — matches.
- The rationale ("`ActiveModel::Attributes` backing only handles primitive types, and a
  `Determination` record should not factor into ... `#blank?`") matches the source comment
  (lines 58-61). The doc additionally appends "value equality" to the rationale, which the source
  states as a consequence rather than the stated reason — too minor to flag.
