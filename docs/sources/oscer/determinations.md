---
id: example-oscer-determinations
title: OSCER — determinations and the Determinable concern
source: oscer
doc_type: example
tags: [example-app, oscer, determination, determinable, compliance, audit-log]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-rules-engine
  - example-oscer-verification-data-sources
  - example-oscer-audit-log-and-actors
demonstrates: [determination, concerns/determinable]
summary: How OSCER extends Strata::Determination and includes Strata::Determinable to record automated and manual compliance/exclusion/exception/exemption decisions on the Certification aggregate.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/determination.rb
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/determinations/hours_based_determination_data.rb
    - reporting-app/app/models/determinations/income_based_determination_data.rb
    - reporting-app/app/models/determinations/external_ce_combined_determination_data.rb
    - reporting-app/app/models/api/certifications/outcome.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — determinations and the Determinable concern

OSCER records every compliance/exclusion/exception/exemption decision as a `Strata::Determination`.
It extends the SDK class with domain enums and reason codes, and makes the `Certification`
aggregate determinable.

## Extending `Strata::Determination`

`Determination < Strata::Determination` (`app/models/determination.rb`) inherits the SDK's
polymorphic `subject` association, required-field validations
(`decision_method`, `reasons`, `outcome`, `determination_data`, `determined_at`), and query scopes,
then adds OSCER's vocabulary:

```ruby
class Determination < Strata::Determination
  # Reason codes are defined in six groups (exclusion, exception, CE-met, CE-insufficient,
  # exemption-request, denial-response) and merged into one flat lookup. A new code goes in
  # exactly one group; its category follows from where it is defined.
  REASON_CODE_GROUPS = [
    EXCLUSION_REASON_CODES, EXCEPTION_REASON_CODES,
    CE_MET_REASON_CODES, CE_INSUFFICIENT_REASON_CODES,
    EXEMPTION_REQUEST_REASON_CODES, DENIAL_RESPONSE_REASON_CODES
  ].freeze
  REASON_CODE_MAPPING = REASON_CODE_GROUPS.reduce(:merge).freeze
  VALID_REASONS = REASON_CODE_MAPPING.values.freeze

  enum :decision_method, { automated: "automated", manual: "manual" }
  enum :outcome, { compliant: "compliant", exempt: "exempt", excluded: "excluded", excepted: "excepted", not_compliant: "not_compliant" }

  validates :reasons, presence: true, inclusion: { in: VALID_REASONS }

  scope :latest_per_subject, -> {
    unscope(:order).select("DISTINCT ON (subject_id) strata_determinations.*").order("subject_id, created_at DESC")
  }
end
```

Note the five-way `outcome` enum: `compliant`, `exempt`, `excluded`, `excepted`, and
`not_compliant` — the source is explicit that "excluded", "excepted", and "exempt" are distinct
outcomes and must not be conflated. The reason-code groups are more than bookkeeping: derived
constants (`EXCEPTION_OUTCOME_KEYS`, `CE_OUTCOME_KEYS`, `NON_EXCLUSION_OUTCOME_KEYS`,
`EXEMPTION_REASONS`, `DENIAL_RESPONSE_REASONS`) are what the determination writers and the
verification-data-source registry validate against. `EXEMPTION_REASONS` deliberately spans groups:
three exclusion conditions also stand as exemption reasons.

### The `determination_data` payload

The SDK persists `determination_data` as a jsonb column. OSCER defines canonical serialized shapes
for automated community-engagement determinations under `app/models/determinations/` —
`HoursBasedDeterminationData`, `IncomeBasedDeterminationData`, and
`ExternalCECombinedDeterminationData` — each built from a compliance-service aggregate via
`from_aggregate(...)` (or `build(...)`) and validated before being written. (These extend the app's
own `ValueObject` base in `reporting-app/lib/value_object.rb`, **not** `Strata::ValueObject`; see
[value objects](./value-objects.md).) Each emits a `calculation_type` discriminator:

| `calculation_type` | Automated writer | Shape |
|---|---|---|
| `hours_based` | `record_hours_compliance`; also reused by the manual `accept_activity_report` / `deny_activity_report` transitions | `HoursBasedDeterminationData` |
| `income_based` | `record_income_compliance` | `IncomeBasedDeterminationData` |
| `external_ce_combined` | `record_external_ce_combined_assessment` | `ExternalCECombinedDeterminationData` (nested `hours` + `income` payloads and a `satisfied_by` of `both`/`hours`/`income`/`neither`) |
| `data_source_ce` | `record_data_source_ce_determination` | flat Hash — a source attests CE is met without reporting figures, so there is no VO behind it |

`ex_parte_ce_combined` (`CALCULATION_TYPE_EXTERNAL_CE_COMBINED_LEGACY`) is the historical value for
the combined shape and survives on old rows only. The class comment is explicit that legacy and
non-CE rows are **not** coerced or re-validated on read, so consumers must treat an unknown
`calculation_type` or missing keys defensively.

A documented gotcha (`record_exclusion_determination`, OSCER issue #680): `determination_data` must
stay a `Hash`; writing a JSON `String` (e.g. `reasons.to_json`) double-encodes into the jsonb column
and reads back as a `String`, which 500'd the member dashboard.

Two read helpers sit on top of the payload. `ce_calculation_type` string-keys the JSON and returns
the discriminator. `source` reports where the determination came from — preferring
`determination_data["data_source"]` (a verification data source id, or `API_SOURCE`) and falling
back to actor provenance (`automated?` ? `API_SOURCE` : `MEMBER_SOURCE`) for the writers that record
no source and for legacy rows. `Api::Certifications::Outcome.from_certification` surfaces that
`source` (and `reason`) on the API outcome only for non-`not_compliant` determinations. A
`not_compliant` determination yields an outcome carrying just `status` and `timestamp` — nil
`source` and `reason` — with an automated one mapped to `"indeterminate"` and a manual one to
`"not_compliant"`.

## Making an aggregate determinable

`Determinable` (`app/models/concerns/determinable.rb`) wraps `Strata::Determinable`, which supplies
the polymorphic `has_many :determinations` association and the `record_determination!` method. The
app's `Certification` model includes it:

```ruby
# app/models/certification.rb
class Certification < ApplicationRecord
  include Determinable
  # ...
end
```

The concern overrides `record_determination!` to translate an actor into the SDK's
`determined_by_id`, classify the determination by outcome/reasons, and write an audit-log line:

```ruby
module Determinable
  extend ActiveSupport::Concern
  include Strata::Determinable

  def record_determination!(decision_method:, reasons:, outcome:, determination_data:, determined_at:, actor: nil)
    determined_by_id = actor.is_a?(User) ? actor.id : nil
    determination = super(decision_method:, reasons:, outcome:, determination_data:, determined_at:, determined_by_id:)

    determination_method =
      if outcome.to_sym == :excluded then :exclusion
      elsif outcome.to_sym == :excepted then :exception
      elsif (reasons & Determination::EXEMPTION_REASONS).any? then :exemption
      elsif (reasons & Determination::DENIAL_RESPONSE_REASONS).any? then :denial_response
      else :activity_report
      end
    determination_status = outcome.to_sym == :not_compliant ? :denied : :approved
    Strata::AuditLog.write!(action: "case.#{determination_method}.#{determination_status}",
      actor:, subject: self, data: { determination_id: determination.id })
    determination
  end
end
```

## How determinations get recorded

`CertificationCase` calls `certification.record_determination!` inside its transition methods —
both for **manual** staff decisions (`accept_activity_report`, `deny_activity_report`,
`accept_exemption_request`, `accept_denial_response`, `deny_denial_response`) and for **automated**
ones (`record_exclusion_determination`, `record_exception_determination`, `record_hours_compliance`,
`record_income_compliance`, `record_data_source_ce_determination`,
`record_external_ce_combined_assessment`). For example, a manual approval:

```ruby
certification.record_determination!(
  decision_method: :manual,
  reasons: [ Determination::REASON_CODE_MAPPING[:hours_reported_compliant] ],
  outcome: :compliant,
  determination_data: Determinations::HoursBasedDeterminationData.from_aggregate(hours_data).to_h,
  determined_at: Time.current,
  actor: user
)
```

Exactly one determination is recorded per member per pass through the automated steps, and that
constraint shapes where the negative lives: `CommunityEngagementCheckService` records **nothing**
when the in-hand assessment falls short, deferring the `not_compliant` row to the trailing
`DataSourceCheckService` so a member a source later excepts is never left with a superseded
`not_compliant` row and a false `case.activity_report.denied` audit line (see
[verification data sources](./verification-data-sources.md)).

The determination services (`ExclusionDeterminationService`, `ExceptionDeterminationService`,
`CommunityEngagementCheckService`, `DataSourceCheckService`) include `Strata::VirtualActor` and pass
that virtual actor instead of a `User`; the standalone hours/income compliance recalculations
(`record_hours_compliance` / `record_income_compliance`) record with no actor (`actor: nil`) — see
[rules engine](./rules-engine.md) and [audit log and actors](./audit-log-and-actors.md).
