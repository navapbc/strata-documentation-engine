---
id: example-oscer-rules-engine
title: OSCER — rules engine (exclusion eligibility)
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, rules-engine, eligibility, exclusion]
related:
  - example-oscer-overview
  - example-oscer-determinations
  - example-oscer-audit-log-and-actors
demonstrates: [rules-engine]
summary: How OSCER defines a Strata::Rules::MedicaidRuleset subclass and runs it through Strata::RulesEngine to compute community-engagement exclusion eligibility.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/models/rules/exclusion_ruleset.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/models/determination.rb
last_documented: 2026-07-21
---

# OSCER — rules engine (exclusion eligibility)

OSCER uses the SDK's `Strata::RulesEngine` to decide whether a member is **excluded** from the
community-engagement requirement based on declarative eligibility rules. (Exclusion is the first of
the three automated determination steps; a distinct, non-rules-engine `ExceptionDeterminationService`
handles time-window "exception" checks afterward — see [business process](./business-process.md).)

## The ruleset

`Rules::ExclusionRuleset < Strata::Rules::MedicaidRuleset` (`app/models/rules/exclusion_ruleset.rb`)
defines one method per fact. Each method takes named inputs (resolved by the engine from the facts
set on it) and returns a boolean (or `nil` when the input is missing, so the fact is treated as
undetermined). Most checks are evaluated against the certification date at month granularity:

```ruby
module Rules
  class ExclusionRuleset < Strata::Rules::MedicaidRuleset
    POSTPARTUM_EXCLUSION_MONTHS = 12
    FORMER_FOSTER_CARE_AGE_CAP = 26
    INMATE_BUFFER_MONTHS = 3

    def is_pregnant(pregnancy_due_or_parturition_date, certification_date)
      return if pregnancy_due_or_parturition_date.nil? || certification_date.nil?
      exclusion_end = pregnancy_due_or_parturition_date + POSTPARTUM_EXCLUSION_MONTHS.months
      certification_date.beginning_of_month <= exclusion_end
    end

    def is_american_indian_or_alaska_native(race_ethnicity)
      return if race_ethnicity.nil?
      AMERICAN_INDIAN_OR_ALASKA_NATIVE.include?(race_ethnicity.downcase.gsub(/\s+/, "_"))
    end

    def is_veteran_with_disability(veteran_with_disability)
      veteran_with_disability
    end

    # ... former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate

    # Aggregate rule: excluded if ANY sub-fact is true
    def eligible_for_exclusion(is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability, former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate)
      facts = [ is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability, former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate ]
      return if facts.all?(&:nil?)
      facts.any?
    end
  end
end
```

Note the composition: `eligible_for_exclusion` consumes the results of the other fact methods (the
SDK resolves the dependency graph). Time-based checks use constants like `POSTPARTUM_EXCLUSION_MONTHS`
and `INMATE_BUFFER_MONTHS` to define the exclusion window.

## Running the engine

`ExclusionDeterminationService` (`app/services/exclusion_determination_service.rb`) instantiates the
ruleset, wraps it in `Strata::RulesEngine`, sets the input facts (pulled from the certification's
`member_data`), and evaluates the top-level fact:

```ruby
def evaluate_exclusion_eligibility(certification)
  ruleset = Rules::ExclusionRuleset.new
  engine = Strata::RulesEngine.new(ruleset)

  engine.set_facts(
    pregnancy_due_or_parturition_date: extract_attribute(certification, :pregnancy_due_or_parturition_date),
    certification_date: certification.certification_requirements.certification_date,
    race_ethnicity: extract_attribute(certification, :race_ethnicity),
    veteran_with_disability: extract_attribute(certification, :veteran_with_disability),
    was_in_foster_care: extract_attribute(certification, :was_in_foster_care),
    date_of_birth: extract_attribute(certification, :date_of_birth),
    # ... currently_medically_frail, dates_caretaking_infirm, dependent_children_birth_dates,
    #     meeting_tanf_or_snap_work, dates_in_drug_treatment, dates_incarcerated
  )

  engine.evaluate(:eligible_for_exclusion)
end
```

`engine.evaluate(:eligible_for_exclusion)` returns a fact whose `value` is the boolean result and
whose `reasons` carry the contributing sub-facts.

## From fact to determination

The service branches on the evaluated fact's `value`. When excluded, it selects the
single **highest-priority** true exclusion (lowest `Exclusion` priority number wins), records the
determination on the case, and publishes `DeterminedExcluded`; otherwise it writes an audit line and
publishes `DeterminedNotExcluded`:

```ruby
eligibility_fact = evaluate_exclusion_eligibility(certification)

if eligibility_fact.value
  kase.record_exclusion_determination([ highest_priority_reason_code(eligibility_fact) ], self)   # self is the virtual actor
  Strata::EventManager.publish("DeterminedExcluded", { case_id: kase.id, certification_id: kase.certification_id })
else
  Strata::AuditLog.write!(action: "case.exclusion.denied", actor: self, subject: certification)
  Strata::EventManager.publish("DeterminedNotExcluded", { case_id: kase.id, certification_id: kase.certification_id })
end
```

`highest_priority_reason_code` picks the winning true sub-fact (`eligibility_fact.reasons`) and maps
its name through `Determination::REASON_CODE_MAPPING` into the stored reason code (see
[determinations](./determinations.md)). The service mixes in `Strata::VirtualActor` so the recorded
determination and audit line are attributed to a system actor (see
[audit log and actors](./audit-log-and-actors.md)).
