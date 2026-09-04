---
id: example-oscer-rules-engine
title: OSCER — rules engine (exclusion eligibility)
source: oscer
doc_type: example
tags: [example-app, oscer, rules-engine, eligibility, exclusion]
related:
  - example-oscer-overview
  - example-oscer-determinations
  - example-oscer-verification-data-sources
  - example-oscer-audit-log-and-actors
demonstrates: [rules-engine]
summary: How OSCER defines a Strata::Rules::MedicaidRuleset subclass and runs it through Strata::RulesEngine to compute community-engagement exclusion eligibility.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/rules/exclusion_ruleset.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/models/certifications/member_data.rb
    - reporting-app/app/models/determination.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — rules engine (exclusion eligibility)

OSCER uses the SDK's `Strata::RulesEngine` to decide whether a member is **excluded** from the
community-engagement requirement based on declarative eligibility rules. (Exclusion is the first of
the four automated determination steps; a distinct, non-rules-engine `ExceptionDeterminationService`
handles the "exception" checks afterward — see [business process](./business-process.md).)

## The ruleset

`Rules::ExclusionRuleset < Strata::Rules::MedicaidRuleset` (`app/models/rules/exclusion_ruleset.rb`)
defines one method per fact. Each method takes named inputs (resolved by the engine from the facts
set on it) and returns a boolean, or `nil` when an input is missing so the fact is treated as
undetermined. Nearly every check reduces to the same question — does a verified, API-supplied
exemption period cover the certification month? — expressed once in the private
`meets_end_condition` helper and evaluated at **month granularity**:

```ruby
module Rules
  class ExclusionRuleset < Strata::Rules::MedicaidRuleset
    FORMER_FOSTER_CARE_AGE_CAP = 26
    CARETAKER_CHILD_AGE_THRESHOLD = 14
    INMATE_BUFFER_MONTHS = 3

    def is_pregnant(pregnancy, postpartum, certification_date)
      meets_end_condition(pregnancy, certification_date) || meets_end_condition(postpartum, certification_date)
    end

    def is_american_indian_or_alaska_native(american_indian_or_alaska_native)
      american_indian_or_alaska_native.present?
    end

    def is_veteran_with_disability(veteran_disability, certification_date)
      meets_end_condition(veteran_disability, certification_date)
    end

    # ... former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate

    # Aggregate rule: excluded if ANY sub-fact is true; undetermined if all are nil
    def eligible_for_exclusion(is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability, former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate)
      facts = [ is_pregnant, is_american_indian_or_alaska_native, is_veteran_with_disability, former_foster_care, medically_frail, caretaker, tanf_snap_work, drug_treatment, inmate ]
      return if facts.all?(&:nil?)
      facts.any?
    end

    private

    def meets_end_condition(member_data_exemption, certification_date)
      return if certification_date.nil?
      return if member_data_exemption.nil?

      cert_month = certification_date.beginning_of_month
      Array(member_data_exemption.periods).any? do |period|
        next unless period.period_start && period.period_end
        period.period_start.beginning_of_month <= cert_month && cert_month <= period.period_end.end_of_month
      end
    end
  end
end
```

Note the composition: `eligible_for_exclusion` consumes the results of the other fact methods (the
SDK resolves the dependency graph). Two rules add their own window arithmetic on top of the shared
helper — `caretaker` treats each `caregiver_child` period as starting at the child's date of birth
and running to `CARETAKER_CHILD_AGE_THRESHOLD`, and `inmate` extends each incarceration period by
`INMATE_BUFFER_MONTHS` — while `former_foster_care` bypasses the helper entirely, comparing the
certification month against `date_of_birth + FORMER_FOSTER_CARE_AGE_CAP.years`.

## Running the engine

`ExclusionDeterminationService` (`app/services/exclusion_determination_service.rb`) instantiates the
ruleset, wraps it in `Strata::RulesEngine`, sets the input facts, and evaluates the top-level fact.
The facts are the certification's API-supplied `member_data`, read through
`Certifications::MemberData#verified_exemption(type)` — one place that filters for an exemption that
both applies (`value`) and has `verification_status == "verified"`:

```ruby
def evaluate_exclusion_eligibility(certification)
  ruleset = Rules::ExclusionRuleset.new
  engine = Strata::RulesEngine.new(ruleset)

  engine.set_facts(
    pregnancy: extract_exemption(certification, :pregnancy),
    postpartum: extract_exemption(certification, :postpartum),
    certification_date: certification.certification_requirements.certification_date,
    american_indian_or_alaska_native: extract_exemption(certification, :american_indian_or_alaska_native),
    veteran_disability: extract_exemption(certification, :veteran_disability),
    was_in_foster_care: extract_exemption(certification, :former_foster_care),
    date_of_birth: extract_attribute(certification, :date_of_birth),
    # ... medical_condition, caregiver_disability, caregiver_child,
    #     meeting_tanf_or_snap_work, substance_treatment, incarceration
  )

  engine.evaluate(:eligible_for_exclusion)
end
```

`engine.evaluate(:eligible_for_exclusion)` returns a fact whose `value` is the boolean result and
whose `reasons` carry the contributing sub-facts (each with its own `name` and `value`).

## From fact to determination

The engine's answer is a **starting bid**, not the final word. `determine` takes the
highest-priority exclusion the rules engine found (lowest `Exclusion` priority number wins), then
lets the configured verification data sources try to improve on it, and records whichever
determination survives:

```ruby
def determine(kase)
  certification = Certification.find(kase.certification_id)

  current_best = rules_engine_best_exclusion(certification)
  current_best, exceptions = consult_data_sources(certification, current_best)

  if current_best
    kase.record_exclusion_determination([ reason_code(current_best[:key]) ], self, current_best[:source])
    publish(kase, "DeterminedExcluded")
  elsif exceptions.any?
    first = exceptions.first
    kase.record_exception_determination([ reason_code(first[:key]) ], self, data_source: first[:source])
    publish(kase, "DeterminedExcepted")
  else
    Strata::AuditLog.write!(action: "case.exclusion.denied", actor: self, subject: certification)
    publish(kase, "DeterminedNotExcluded")
  end
end
```

Details worth noting:

- The rules engine's own exclusion is tagged `source: Determination::API_SOURCE`, because its facts
  come from API-supplied member data. A data source's exclusion is tagged with that source's id.
- `consult_data_sources` sorts candidate sources by the best exclusion priority they *could* emit
  (`declared_outcomes` mapped through `Exclusion.find(...)&.fetch(:priority)`) and **stops calling** as soon
  as no remaining source could outrank the running best — the ranking is what prunes the work.
  Exception outcomes emitted along the way are collected as a fallback.
- Sources with no exclusion in `declared_outcomes` are skipped here; they belong to the trailing
  ordered pass (see [verification data sources](./verification-data-sources.md)).
- `exclusion_priority` raises a `KeyError` naming the fact when a ruleset fact has no configured
  `Exclusion` entry — the deliberate fail-loud guard on the fact/config seam. Its non-raising
  sibling `exclusion_priority_or_nil` is what classifies an arbitrary emitted key as
  exclusion-or-not.

Reason codes are resolved through `Determination::REASON_CODE_MAPPING` (see
[determinations](./determinations.md)). The service mixes in `Strata::VirtualActor` so the recorded
determination and audit line are attributed to a system actor (see
[audit log and actors](./audit-log-and-actors.md)).
