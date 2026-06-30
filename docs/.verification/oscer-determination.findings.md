# Verification findings: oscer-determination (round 1)

Doc: `docs/sources/oscer/determination.md`
Source checkout: `.sources/oscer`

## Result

No findings. The doc is fully supported by the source.

### Claims checked

- `Determination < Strata::Determination` with `decision_method`/`outcome` enums, `REASON_CODE_MAPPING`, `VALID_REASONS`, validations, `default_scope`, and `for_certifications`/`latest_per_subject` scopes — all match `reporting-app/app/models/determination.rb` (lines 49-127). `for_certifications` targets `subject_type: "Certification"`; `latest_per_subject` uses `unscope(:order)`, `DISTINCT ON (subject_id)`, and `strata_determinations.*` as documented (lines 104-113).
- The `Determinable#record_determination!` override (actor→`determined_by_id`, `super`, `determination_method` classification via `EXEMPTION_REASONS`/`DENIAL_RESPONSE_REASONS` defaulting to `:activity_report`, `determination_status`, `Strata::AuditLog.write!` with `case.<method>.<status>` action) matches `reporting-app/app/models/concerns/determinable.rb` (lines 50-77) exactly.
- `Certification include Determinable` on the aggregate root (not `CertificationCase`) — matches `certification.rb` line 7.
- The `record_determination!` call example matches `accept_activity_report` in `certification_case.rb` (lines 65-72).
- Automated paths pass a `Strata::VirtualActor` and `decision_method: :automated`; `Determination.to_reason_codes(eligibility_fact)` converts eligibility facts to reason codes — matches `record_exemption_determination` (lines 190-213) and `Determination.to_reason_codes` (determination.rb lines 115-118).
- The `actor` may be a `User` or `Strata::VirtualActor` — supported by `actor.is_a?(User) ? actor.id : nil` (determinable.rb line 51) and the `@param actor [Strata::VirtualActor]` doc comment (certification_case.rb line 189).
- The `determination_data` jsonb description (CE VO-backed shapes with formal schema vs. ad-hoc/legacy shapes read defensively) is supported by the class comment in `determination.rb` (lines 33-48).
