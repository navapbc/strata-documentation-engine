# Verification findings: oscer-rules-engine (round 1)

Doc: `docs/sources/oscer/rules-engine.md`
Source: `.sources/oscer`

## Result: no findings

All claims in the doc are supported by the source checkout:

- The `Rules::ExemptionRuleset` code block matches `reporting-app/app/models/rules/exemption_ruleset.rb` exactly (rule methods, `AMERICAN_INDIAN_OR_ALASKA_NATIVE` constant, `eligible_for_exemption` nil/any logic).
- The engine usage block (`Strata::RulesEngine.new(ruleset)` -> `set_facts(...)` -> `evaluate(:eligible_for_exemption)`) matches `evaluate_exemption_eligibility` in `reporting-app/app/services/exemption_determination_service.rb`, including the exact `set_facts` keys.
- The service branching description (true -> `record_exemption_determination` + publish `DeterminedExempt`; false -> audit log + publish `DeterminedNotExempt`, no Determination row) matches `ExemptionDeterminationService.determine`.
- `CertificationCase#record_exemption_determination` calls `Determination.to_reason_codes(eligibility_fact)` — confirmed (certification_case.rb line 198).
- The `to_reason_codes` snippet matches `determination.rb` lines 116-117: `eligibility_fact.reasons.select { |reason| reason.value }.map(&:name).map(&:to_sym)` then `.map { |reason| REASON_CODE_MAPPING[reason] }`.
- `age_over_65` being inherited from the base `MedicaidRuleset` (referenced by `eligible_for_exemption`, not redefined) is consistent with the source.

The doc is fully supported by the source.
