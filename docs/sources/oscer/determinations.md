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
  - example-oscer-audit-log-and-actors
demonstrates: [determination, concerns/determinable]
summary: How OSCER extends Strata::Determination and includes Strata::Determinable to record automated and manual compliance/exemption decisions on the Certification aggregate.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/models/determination.rb
    - reporting-app/app/models/concerns/determinable.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/determinations/hours_based_determination_data.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — determinations and the Determinable concern

OSCER records every compliance/exemption decision as a `Strata::Determination`. It extends the SDK
class with domain enums and reason codes, and makes the `Certification` aggregate determinable.

## Extending `Strata::Determination`

`Determination < Strata::Determination` (`app/models/determination.rb`) inherits the SDK's
polymorphic `subject` association, required-field validations
(`decision_method`, `reasons`, `outcome`, `determination_data`, `determined_at`), and query scopes,
then adds OSCER's vocabulary:

```ruby
class Determination < Strata::Determination
  REASON_CODE_MAPPING = {
    age_under_19: "age_under_19_exempt",
    income_reported_compliant: "income_reported_compliant",
    hours_reported_compliant: "hours_reported_compliant",
    # ...
  }.freeze
  VALID_REASONS = REASON_CODE_MAPPING.values.freeze

  enum :decision_method, { automated: "automated", manual: "manual" }
  enum :outcome, { compliant: "compliant", exempt: "exempt", not_compliant: "not_compliant" }

  validates :reasons, presence: true, inclusion: { in: VALID_REASONS }

  scope :latest_per_subject, -> {
    unscope(:order).select("DISTINCT ON (subject_id) strata_determinations.*").order("subject_id, created_at DESC")
  }
end
```

The SDK persists `determination_data` as a jsonb column. OSCER defines canonical serialized shapes
for automated community-engagement determinations as value objects under
`app/models/determinations/` — `HoursBasedDeterminationData`, `IncomeBasedDeterminationData`, and
`ExternalCECombinedDeterminationData` — each built from a compliance-service aggregate via
`from_aggregate(...)` and validated before being written. A documented gotcha
(`record_exemption_determination`, OSCER issue #680): `determination_data` must stay a `Hash`;
writing a JSON `String` double-encodes into the jsonb column.

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
`determined_by_id` and to write an audit-log line keyed off the reason set:

```ruby
module Determinable
  extend ActiveSupport::Concern
  include Strata::Determinable

  def record_determination!(decision_method:, reasons:, outcome:, determination_data:, determined_at:, actor: nil)
    determined_by_id = actor.is_a?(User) ? actor.id : nil
    determination = super(decision_method:, reasons:, outcome:, determination_data:, determined_at:, determined_by_id:)

    # classify the determination, then write a Strata::AuditLog line
    Strata::AuditLog.write!(action: "case.#{determination_method}.#{determination_status}",
      actor:, subject: self, data: { determination_id: determination.id })
    determination
  end
end
```

## How determinations get recorded

`CertificationCase` calls `certification.record_determination!` inside its transition methods —
both for **manual** staff decisions (`accept_activity_report`, `deny_activity_report`,
`accept_exemption_request`, `accept_denial_response`, …) and for **automated** ones
(`record_hours_compliance`, `record_income_compliance`, `record_external_ce_combined_assessment`,
`record_exemption_determination`). For example, a manual approval:

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

The exemption and combined-CE services (`ExemptionDeterminationService`,
`CommunityEngagementCheckService`) include `Strata::VirtualActor` and pass that virtual actor
instead of a `User`; the standalone hours/income compliance recalculations
(`record_hours_compliance` / `record_income_compliance`) record with no actor (`actor: nil`) — see
[rules engine](./rules-engine.md) and [audit log and actors](./audit-log-and-actors.md).
</content>
