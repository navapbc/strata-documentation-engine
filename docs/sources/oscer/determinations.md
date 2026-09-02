---
id: example-oscer-determinations
title: OSCER — determinations and the Determinable concern
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, determination, determinable, compliance, audit-log]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-rules-engine
  - example-oscer-audit-log-and-actors
demonstrates: [determination, concerns/determinable]
summary: How OSCER extends Strata::Determination and includes Strata::Determinable to record automated and manual compliance/exclusion/exception/exemption decisions on the Certification aggregate.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/models/determination.rb
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/determinations/hours_based_determination_data.rb
last_documented: 2026-07-21
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
  REASON_CODE_MAPPING = {
    age_under_19: "age_under_19_excluded",
    is_pregnant: "pregnancy_excluded",
    income_reported_compliant: "income_reported_compliant",
    hours_reported_compliant: "hours_reported_compliant",
    exemption_request_compliant: "exemption_request_compliant",
    denial_response_convincing: "denial_response_convincing",
    # ... plus exception reason codes (e.g. was_pregnant: "pregnancy_excepted")
  }.freeze
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
outcomes and must not be conflated.

The SDK persists `determination_data` as a jsonb column. OSCER defines canonical serialized shapes
for automated community-engagement determinations as value objects under
`app/models/determinations/` — `HoursBasedDeterminationData`, `IncomeBasedDeterminationData`, and
`ExternalCECombinedDeterminationData` — each built from a compliance-service aggregate via
`from_aggregate(...)` (or `build(...)`) and validated before being written. A documented gotcha
(`record_exclusion_determination`, OSCER issue #680): `determination_data` must stay a `Hash`;
writing a JSON `String` (e.g. `reasons.to_json`) double-encodes into the jsonb column and reads back
as a String, which 500'd the member dashboard.

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
`record_income_compliance`, `record_external_ce_combined_assessment`). For example, a manual
approval:

```ruby
certification.record_determination!(
  decision_method: :manual,
  reasons: [ Determination::REASON_CODE_MAPPING[:hours_reported_compliant] ],
  outcome: :compliant,
  determination_data: Determinations::HoursBasedDeterminationData.from_aggregate(hours_data).to_h,
  determined_at: certification.certification_requirements.certification_date,
  actor: user
)
```

The determination services (`ExclusionDeterminationService`, `ExceptionDeterminationService`,
`CommunityEngagementCheckService`) include `Strata::VirtualActor` and pass that virtual actor
instead of a `User`; the standalone hours/income compliance recalculations
(`record_hours_compliance` / `record_income_compliance`) record with no actor (`actor: nil`) — see
[rules engine](./rules-engine.md) and [audit log and actors](./audit-log-and-actors.md).
