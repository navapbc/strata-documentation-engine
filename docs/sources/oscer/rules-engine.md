---
id: example-oscer-rules-engine
title: OSCER — rules engine (exemption eligibility)
source: oscer
doc_type: example
tags: [example-app, oscer, rules-engine, eligibility, exemption]
related:
  - example-oscer-overview
  - example-oscer-determinations
  - example-oscer-audit-log-and-actors
demonstrates: [rules-engine]
summary: How OSCER defines a Strata::Rules::MedicaidRuleset subclass and runs it through Strata::RulesEngine to compute age/pregnancy/AIAN/veteran exemption eligibility.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/models/rules/exemption_ruleset.rb
    - reporting-app/app/services/exemption_determination_service.rb
    - reporting-app/app/models/determination.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — rules engine (exemption eligibility)

OSCER uses the SDK's `Strata::RulesEngine` to decide whether a member is exempt from the
community-engagement requirement based on declarative eligibility rules.

## The ruleset

`Rules::ExemptionRuleset < Strata::Rules::MedicaidRuleset` (`app/models/rules/exemption_ruleset.rb`)
defines one method per fact. Each method takes named inputs (resolved by the engine from the facts
set on it) and returns a boolean (or `nil` when the input is missing, so the fact is treated as
undetermined):

```ruby
module Rules
  class ExemptionRuleset < Strata::Rules::MedicaidRuleset
    def age_under_19(age)
      return if age.nil?
      age < 19
    end

    def is_pregnant(pregnancy_status)
      return if pregnancy_status.nil?
      pregnancy_status
    end

    def is_american_indian_or_alaska_native(race_ethnicity)
      return if race_ethnicity.nil?
      AMERICAN_INDIAN_OR_ALASKA_NATIVE.include?(race_ethnicity.downcase.gsub(/\s+/, "_"))
    end

    def is_veteran_with_disability(veteran_disability_rating)
      return if veteran_disability_rating.nil?
      combined_rating = veteran_disability_rating.dig("data", "attributes", "combined_disability_rating")
      return false if combined_rating.nil?
      combined_rating.to_i == 100
    end

    # Aggregate rule: exempt if ANY sub-fact is true
    def eligible_for_exemption(age_under_19, age_over_65, is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability)
      facts = [ age_under_19, age_over_65, is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability ]
      return if facts.all?(&:nil?)
      facts.any?
    end
  end
end
```

Note the composition: `eligible_for_exemption` consumes the results of the other fact methods (the
SDK resolves the dependency graph). `age_over_65` is inherited from the base
`Strata::Rules::MedicaidRuleset`.

## Running the engine

`ExemptionDeterminationService` (`app/services/exemption_determination_service.rb`) instantiates the
ruleset, wraps it in `Strata::RulesEngine`, sets the input facts, and evaluates the top-level fact:

```ruby
def evaluate_exemption_eligibility(certification)
  ruleset = Rules::ExemptionRuleset.new
  engine = Strata::RulesEngine.new(ruleset)

  engine.set_facts(
    date_of_birth: extract_date_of_birth(certification),
    evaluated_on: extract_evaluation_date(certification),
    pregnancy_status: extract_pregnancy_status(certification),
    race_ethnicity: extract_race_ethnicity(certification),
    veteran_disability_rating: extract_veteran_disability_status(certification)
  )

  engine.evaluate(:eligible_for_exemption)
end
```

`engine.evaluate(:eligible_for_exemption)` returns a `Strata::RulesEngine::Fact` whose `value` is the
boolean result and whose `reasons` carry the contributing sub-facts.

## From fact to determination

The service branches on the evaluated fact's `value`. When exempt, it records the determination on
the case and publishes `DeterminedExempt`; otherwise it writes an audit line and publishes
`DeterminedNotExempt`:

```ruby
eligibility_fact = evaluate_exemption_eligibility(certification)

if eligibility_fact.value
  kase.record_exemption_determination(eligibility_fact, self)   # self is the virtual actor
  Strata::EventManager.publish("DeterminedExempt", { case_id: kase.id, certification_id: kase.certification_id })
else
  Strata::AuditLog.write!(action: "case.exemption.denied", actor: self, subject: certification)
  Strata::EventManager.publish("DeterminedNotExempt", { case_id: kase.id, certification_id: kase.certification_id })
end
```

`Determination.to_reason_codes(eligibility_fact)` maps the fact's true reasons (e.g. `:is_pregnant`)
into the `REASON_CODE_MAPPING` codes stored on the determination (see
[determinations](./determinations.md)). The service mixes in `Strata::VirtualActor` so the recorded
determination and audit line are attributed to a system actor (see
[audit log and actors](./audit-log-and-actors.md)).
</content>
