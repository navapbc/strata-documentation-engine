# Verification findings: example-oscer-rules-engine

Doc: docs/sources/oscer/rules-engine.md
Source: .sources/oscer
Round: 1

## Result: no findings

All OSCER-side claims were re-checked against the source and are supported:

- `Rules::ExemptionRuleset < Strata::Rules::MedicaidRuleset` and all fact methods
  (`age_under_19`, `is_pregnant`, `is_american_indian_or_alaska_native`,
  `is_veteran_with_disability`, `eligible_for_exemption`) match
  `reporting-app/app/models/rules/exemption_ruleset.rb` exactly, including the `return if x.nil?`
  undetermined-fact semantics and the `facts.all?(&:nil?)` / `facts.any?` aggregate logic.
- The `evaluate_exemption_eligibility` snippet (instantiate ruleset, wrap in
  `Strata::RulesEngine`, `set_facts(...)`, `engine.evaluate(:eligible_for_exemption)`) matches
  `reporting-app/app/services/exemption_determination_service.rb` (set_facts keys: date_of_birth,
  evaluated_on, pregnancy_status, race_ethnicity, veteran_disability_rating).
- The branch-on-`eligibility_fact.value` block, `record_exemption_determination`, the
  `DeterminedExempt` / `DeterminedNotExempt` event publishes, and the
  `case.exemption.denied` audit-log write all match the service source.
- `Determination.to_reason_codes(eligibility_fact)` and `REASON_CODE_MAPPING` exist in
  `reporting-app/app/models/determination.rb`; `to_reason_codes` selects `reasons` where
  `reason.value` and maps `name` → code, confirming the doc's description of `Fact#value` /
  `Fact#reasons`.
- `record_exemption_determination(eligibility_fact, actor)` exists in
  `reporting-app/app/models/certification_case.rb` and its docstring types the argument as
  `Strata::RulesEngine::Fact`, confirming the doc's `Fact` type claim.
- `ExemptionDeterminationService` does `include Strata::VirtualActor`, confirming the VirtualActor
  attribution claim.

SDK-internal claims (`age_over_65` inherited from `Strata::Rules::MedicaidRuleset`, the engine
resolving the fact dependency graph, the shape of `Strata::RulesEngine::Fact`) cannot be
independently confirmed because the Strata SDK gem is not vendored in this checkout. None of these
claims are contradicted by the OSCER source, and the OSCER usage is fully consistent with them.
