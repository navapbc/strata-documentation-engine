---
id: example-oscer-verification-data-sources
title: OSCER — verification data sources in a system_process
source: oscer
doc_type: example
tags: [example-app, oscer, system-process, determination, virtual-actor, adapters]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-determinations
  - example-oscer-rules-engine
  - example-oscer-audit-log-and-actors
demonstrates: [task/system-process, determination, virtual-actor]
summary: How OSCER's trailing verification-data-source step calls external sources behind a uniform adapter contract and records the winning outcome as a Strata::Determination via a virtual actor.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/services/data_source_check_service.rb
    - reporting-app/app/services/verification/data_source.rb
    - reporting-app/app/services/verification/data_source_orchestrator.rb
    - reporting-app/app/models/verification/data_source_result.rb
    - reporting-app/app/models/verification/orchestration_result.rb
    - reporting-app/app/services/verification_data_sources_loader.rb
    - reporting-app/app/services/verification/adapters/va_disability_rating.rb
    - reporting-app/app/services/verification/adapters/mock_emergency_county.rb
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/services/exclusion_determination_service.rb
    - reporting-app/app/services/verification/adapters/mock_drug_treatment.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/config/custom/verification_data_sources.yml
last_documented: 2026-09-04
verified: ok
---

# OSCER — verification data sources in a system_process

Paths in this doc are relative to `reporting-app/` in the OSCER repo.

The last of OSCER's four automated determination steps is
`VERIFICATION_DATA_SOURCE_CHECK_STEP`, a `system_process` that runs
`DataSourceCheckService.determine(kase)`. It is the only step that calls **out**: the three before
it assess data already in hand. This doc covers how that step is built, because it is the app's
fullest example of a `system_process` that reaches an external system and still lands exactly one
`Strata::Determination`.

## The step

```ruby
# reporting-app/app/business_processes/certification_business_process.rb
system_process(VERIFICATION_DATA_SOURCE_CHECK_STEP, ->(kase) {
  DataSourceCheckService.determine(kase)
})

transition(VERIFICATION_DATA_SOURCE_CHECK_STEP, "DeterminedExcepted", END_STEP)
transition(VERIFICATION_DATA_SOURCE_CHECK_STEP, "DeterminedCommunityEngagementMet", END_STEP)
transition(VERIFICATION_DATA_SOURCE_CHECK_STEP, "DeterminedCommunityEngagementInsufficient", REPORT_ACTIVITIES_STEP)
transition(VERIFICATION_DATA_SOURCE_CHECK_STEP, "DeterminedCommunityEngagementActionRequired", REPORT_ACTIVITIES_STEP)
```

## The adapter contract

`Verification::DataSource` (`reporting-app/app/services/verification/data_source.rb`) is the contract every source
conforms to. The public `#call(certification:)` is a template method; subclasses implement the
protected `#precondition_met?` and `#perform`, plus the class method `.declared_outcomes`:

```ruby
def call(certification:)
  return skipped_result unless precondition_met?(certification)

  begin
    result = perform(certification: certification)
  rescue ContractError
    raise                       # never let expected_error_classes swallow a contract violation
  rescue *expected_error_classes => e
    return error_result(e)      # declared integration failures become :error, never nil
  end

  ensure_result!(result)        # non-DataSourceResult return raises ContractError
end
```

The invariants the contract buys, spelled out in the source: never returns `nil`; never raises for
*expected* integration failures (auth, 5xx, timeout, rate limit — each source lists its own
`expected_error_classes`, and the default `[]` catches nothing because `rescue *[]` matches no
exceptions); returns `:skipped` when a precondition is missing, which is distinct from a `:success`
carrying no outcomes. Unexpected errors propagate deliberately.

`Verification::DataSourceResult` (`reporting-app/app/models/verification/data_source_result.rb`) is the uniform
return value, constructed only through `.skipped` / `.success` / `.error`, which normalize inputs and
enforce that `status` is one of the three, `outcomes` is a flat `Array<Symbol>`, and `audit_data` is
always a Hash. `audit_data` is deep-duped and **deep-frozen** so the persisted audit record is
tamper-resistant, and the adapter is required to redact it before it gets there — no raw PHI,
secrets, or tokens. `Verification::Adapters::VaDisabilityRating` is the shape to copy: it wraps the
existing VA transport (`VeteranAffairsAdapter` + `VaTokenManager`), owns its ICN precondition, maps
transport and token errors into `:error` results, and audits a **summary** (the combined rating and
rating id) rather than the full VA payload of individual diagnostic ratings.

## The registry

`VerificationDataSourcesLoader` (`reporting-app/app/services/verification_data_sources_loader.rb`) deep-merges a
deployment-owned override (`config/custom/verification_data_sources.yml`) over OSCER's `DEFAULTS`,
which is `{}.freeze` — there are no OSCER-owned defaults. The registry an OSCER checkout actually
boots with therefore comes entirely from the checked-in override, which registers three enabled mock
sources, two of them order-bearing. Config owns enablement, wiring, and
call `order`; the adapter class owns which outcomes it may emit. Validation is split so the
initializer body stays boot-safe: `.transform` is pure structural checking (required keys, integer
or null `order`, distinct `order` values), while `.validate_registry!` runs from a `to_prepare` hook
because it constantizes `adapter_class`, requires `.declared_outcomes`, and checks each declared
outcome against `Determination::REASON_CODE_MAPPING` keys — so a typo'd outcome fails at boot rather
than mid-determination.

`order` controls membership in this pass only. `DataSourceOrchestrator#ordered_sources` filters on
`enabled && !order.nil?`, while `ExclusionDeterminationService` selects on `enabled` alone and then
narrows by `best_declared_priority` — i.e. by whether the adapter declares an exclusion outcome —
never by `order`:

- **`order: nil`** — a source that sits out this pass. Typically exclusion-only: its outcome ranking
  belongs to `Exclusion.priority_order`, not to call order, so it is reached only through
  `ExclusionDeterminationService` (see [rules engine](./rules-engine.md)).
- **`order: <integer>`** — an order-bearing source that joins this trailing pass. Because the
  exclusion pass ignores `order`, an order-bearing source that also declares an exclusion outcome
  reaches *both* passes — which is exactly the hybrid gap recorded below. For order-bearing sources,
  `validate_non_exclusion_outcome_categories!` additionally requires every declared outcome to be
  categorizable (an exclusion id, or an exception/CE key), because an uncategorized one would raise
  inside the determination where Strata's `execute_current_step` rescues and logs — stranding the
  case with no determination, notification, or staff task. The loader comment records the residual
  gap: a hybrid source that declares both an exclusion outcome and an `order` is registrable and
  would still strand the case, and the durable fix is filtering hybrids out of
  `DataSourceOrchestrator#ordered_sources`.

## The ordered pass

`Verification::DataSourceOrchestrator` (`reporting-app/app/services/verification/data_source_orchestrator.rb`)
calls the enabled order-bearing sources in ascending `order` and stops at the first **positive**
result — `success?` **and** carrying at least one outcome:

```ruby
def evaluate(certification)
  attempted = []

  ordered_sources.each do |entry|
    result = build_source(entry).call(certification: certification)
    attempted << { source_id: entry[:id], result: result }

    if positive?(result)
      return OrchestrationResult.new(satisfied: true, source_id: entry[:id], result: result, attempted: attempted)
    end
  end

  OrchestrationResult.new(satisfied: false, attempted: attempted)
end
```

A `:success` with empty outcomes is a documented "called, no matching outcome" negative and does not
stop the pass; neither does `:skipped` or `:error`. `Verification::OrchestrationResult` carries the
whole `attempted` list — every source called, in order, with its result — so skipped and errored
sources are never silently dropped.

## Recording the determination

`DataSourceCheckService` mixes in `Strata::VirtualActor` and passes `self` as the actor, so the
determination and its audit line are attributed to a system actor
(see [audit log and actors](./audit-log-and-actors.md)):

```ruby
def determine(kase)
  certification = Certification.find(kase.certification_id)
  orchestration = Verification::DataSourceOrchestrator.evaluate(certification)

  return record_source_attestation(kase, orchestration) if orchestration.satisfied?

  log_failed_attempts(kase, orchestration)
  record_requirement_not_met(kase, certification)
end
```

**A source produced an outcome.** `validate_outcomes!` rejects anything outside
`Determination::NON_EXCLUSION_OUTCOME_KEYS` with an `UnsupportedOutcomeError`, then the service
branches by category, mirroring the flow's own precedence — an exception outranks a CE attestation
from the same source:

- exception key present → `record_exception_determination(..., data_source:)` and publish
  `DeterminedExcepted`. Only the **first** key is used, matching the one-reason convention of the
  exclusion and exception services.
- otherwise → `record_data_source_ce_determination(reason_codes(outcomes), self, data_source:)` and
  publish `DeterminedCommunityEngagementMet`. Here **all** outcomes are recorded, because hours-met
  and income-met corroborate rather than compete.

**No source produced an outcome.** The in-hand assessment stands, so the service recomputes it via
`CommunityEngagementCheckService.assess(certification)` — shared with the earlier step precisely so
the two cannot derive it differently — records the combined hours/income assessment via
`Certification::Case#record_external_ce_combined_assessment`, whose outcome is `:compliant` when
either half passes and `:not_compliant` when both fail (normally `not_compliant` here, since this
branch is reached from a not-met CE check), and splits the member-facing event on whether inbound-pushed hours exist:

```ruby
if assessment.hours_data.dig(:hours_by_source, :external).to_f.positive?
  Strata::EventManager.publish("DeterminedCommunityEngagementInsufficient", payload.merge(hours_data:, income_data:))
else
  Strata::EventManager.publish("DeterminedCommunityEngagementActionRequired", payload)
end
```

This is where the negative determination lives, and the source explains why: were it recorded at the
earlier community-engagement check, a member a source goes on to except would be left with a
superseded `not_compliant` row and a false `case.activity_report.denied` audit line. Exactly one
determination per member per pass.

## Known gaps, recorded in the source

`log_failed_attempts` emits a `Rails.logger.warn` naming each failed source and its `error_code`
before the negative is recorded, because an errored source "is not a source that said no" and the
determination row alone is indistinguishable from a clean negative. The comment names two untracked
gaps: that log is the only record that evidence was missing, and an **undeclared** error propagates
into Strata's `execute_current_step`, which is `rescue Exception` plus a log — so the case strands
with no determination, notification, or staff task. Both are flagged as needing a ticket before a
real adapter lands.

## Mock adapters

Three mock sources exist for demonstration and specs. `mock_emergency_county` (`order: 10`) and
`mock_community_engagement` (`order: 20`) are the two order-bearing ones, and are what exercises this
step while no real non-exclusion source exists. `mock_drug_treatment` (`order: null`) runs at the
exclusion step and never reaches the orchestrator; it is also the concrete hybrid, since its
`.declared_outcomes` pairs an exclusion outcome with an exception outcome. They derive outcomes from a single
always-present scalar so specs can drive every branch — the last digit of `va_icn`, or a substring
of the member's email — and their comments are explicit that a real source must not copy the email
trigger, since email both selects the certification record
(`Certification.find_by_member_email`) and would drive a favorable outcome from one
member-influenceable attribute.
