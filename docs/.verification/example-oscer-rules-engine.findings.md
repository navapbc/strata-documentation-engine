# Verification findings: example-oscer-rules-engine (round 2)

**Doc**: `docs/sources/oscer/rules-engine.md`
**Source**: `.sources/oscer` (ref: `be3ffbb4e7b7e7cf0b4047af5544870f50619257`)
**Verified**: 2026-09-04

## Summary

All major claims in the documentation are accurate and well-supported by the source code. No factual errors, unsupported statements, or outdated information found.

## Verification checklist

### Ruleset definition (lines 32-83)

- ✓ Class hierarchy: `Rules::ExclusionRuleset < Strata::Rules::MedicaidRuleset`
- ✓ Constants match: `FORMER_FOSTER_CARE_AGE_CAP = 26`, `CARETAKER_CHILD_AGE_THRESHOLD = 14`, `INMATE_BUFFER_MONTHS = 3`
- ✓ Methods defined: `is_pregnant`, `is_american_indian_or_alaska_native`, `is_veteran_with_disability`, `former_foster_care`, `medically_frail`, `caretaker`, `tanf_snap_work`, `drug_treatment`, `inmate`, `eligible_for_exclusion`
- ✓ Return semantics: Returns boolean or nil (undetermined)
- ✓ `meets_end_condition` helper implementation matches documented logic
- ✓ `eligible_for_exclusion` composition: returns nil if all facts nil, otherwise `facts.any?`

### Window arithmetic (lines 85-90)

- ✓ `caretaker`: Uses `period.period_start.beginning_of_month <= cert_month && cert_month < period.period_start + 14.years` (excludes 0-13 years old)
- ✓ `inmate`: Extends incarceration with `+ INMATE_BUFFER_MONTHS.months`
- ✓ `former_foster_care`: Bypasses helper, compares `certification_date.beginning_of_month < date_of_birth + 26.years`

### Running the engine (lines 92-119)

- ✓ `ExclusionDeterminationService` instantiates `Strata::RulesEngine`
- ✓ Calls `engine.set_facts` with all required facts mapped via `extract_exemption` and `extract_attribute`
- ✓ `Certifications::MemberData#verified_exemption(type)` filters for `exemption.value && exemption.verification_status == "verified"`
- ✓ Evaluates `:eligible_for_exclusion` fact

### From fact to determination (lines 125-171)

- ✓ `determine` method logic: gets rules engine best, consults data sources, records result
- ✓ Rules engine exclusion tagged with `source: Determination::API_SOURCE`
- ✓ `consult_data_sources` sorts by best declared priority and stops early via `outranks?` check
- ✓ Exception outcomes collected as fallback
- ✓ Sources with no exclusion in `declared_outcomes` are skipped
- ✓ `exclusion_priority(fact_name)` raises `KeyError` for unconfigured facts
- ✓ `exclusion_priority_or_nil` is non-raising sibling
- ✓ Reason codes resolved via `Determination::REASON_CODE_MAPPING`

### Cross-references

- ✓ `./business-process.md` exists in docs/sources/oscer/
- ✓ `./verification-data-sources.md` exists
- ✓ `./determinations.md` exists
- ✓ `./audit-log-and-actors.md` exists

### Frontmatter validation

- ✓ `source_ref.ref` matches source checkout SHA: `be3ffbb4e7b7e7cf0b4047af5544870f50619257`
- ✓ All referenced source paths exist
- ✓ `demonstrates: [rules-engine]` is a valid feature key

## Findings

**No issues found.** Documentation is accurate and fully supported by the source code.
