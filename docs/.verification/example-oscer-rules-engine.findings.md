# Verification findings: example-oscer-rules-engine (round 1)

Doc: `docs/sources/oscer/rules-engine.md`
Source checkout: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750` (matches `source_ref.ref`)

## Result

No findings. The doc is fully supported by the source.

## Claims checked (all confirmed)

- `Rules::ExclusionRuleset < Strata::Rules::MedicaidRuleset` with one method per fact — confirmed
  (`reporting-app/app/models/rules/exclusion_ruleset.rb:5`).
- Constants `POSTPARTUM_EXCLUSION_MONTHS = 12`, `FORMER_FOSTER_CARE_AGE_CAP = 26`,
  `INMATE_BUFFER_MONTHS = 3` — confirmed (lines 9, 12, 18). The abbreviated snippet's `# ...` correctly
  elides `former_foster_care`, `medically_frail`, `caretaker`, `tanf_snap_work`, `drug_treatment`,
  `inmate` (lines 40-90).
- `is_pregnant`, `is_american_indian_or_alaska_native`, `is_veteran_with_disability` bodies — confirmed
  (lines 20-36). The doc's single-line combined nil guard for `is_pregnant` is a faithful paraphrase of
  the two source guard clauses.
- `eligible_for_exclusion` aggregate (`facts.all?(&:nil?)` → return; else `facts.any?`) — confirmed
  (lines 92-97).
- `ExclusionDeterminationService.evaluate_exclusion_eligibility` instantiates the ruleset, wraps it in
  `Strata::RulesEngine`, calls `set_facts`, and evaluates `:eligible_for_exclusion` — confirmed
  (`exclusion_determination_service.rb:29-49`). All set_facts keys, including the six behind the doc's
  `# ...` comment, match source order (lines 34-45).
- Branch on `eligibility_fact.value`: excluded → `record_exclusion_determination` + publish
  `DeterminedExcluded`; else → `AuditLog.write!(action: "case.exclusion.denied", ...)` + publish
  `DeterminedNotExcluded` — confirmed (lines 14-24).
- Highest-priority selection: reasons filtered to true, `min_by(exclusion_priority)`, "lowest priority
  number wins", mapped through `Determination::REASON_CODE_MAPPING.fetch` — confirmed (lines 53-68;
  `determination.rb:64-99`).
- Service mixes in `Strata::VirtualActor`; `self` is the class-level virtual actor — confirmed
  (`include Strata::VirtualActor`, `class << self`, lines 4-5).
- Claim that `ExceptionDeterminationService` is a "distinct, non-rules-engine" service — confirmed:
  `exception_determination_service.rb` references `Rules::ExclusionRuleset` only for constants and never
  uses `Strata::RulesEngine`.

SDK-internal claims (the engine resolving the fact dependency graph by parameter name, the shape of the
returned `Fact` with `value`/`reasons`) cannot be independently confirmed because the Strata SDK gem is
not vendored in this checkout. None are contradicted by the OSCER source, and the OSCER usage is fully
consistent with them.
