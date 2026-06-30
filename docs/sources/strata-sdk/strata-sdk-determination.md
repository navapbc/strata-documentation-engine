---
id: strata-sdk-determination
title: Determinations
source: strata-sdk
doc_type: feature
tags: [strata-sdk, determination, decisions, concerns]
related:
  - strata-sdk-application-form
  - strata-sdk-rules-engine
  - strata-sdk-audit-log
feature_keys:
  - determination
  - concerns/determinable
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::Determination record for capturing decisions and the Strata::Determinable concern that adds record_determination!.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/determination.rb
    - app/models/concerns/strata/determinable.rb
verified: ok
last_documented: 2026-06-29
---

# Determinations

`Strata::Determination` (`app/models/strata/determination.rb`, table `strata_determinations`)
records a decision or outcome for any aggregate root. It `belongs_to :subject, polymorphic: true`
(required) and requires `decision_method`, `reasons`, `outcome`, `determination_data`, and
`determined_at` to be present.

Decisions can come from automated processes (`decision_method: :automated`, `determined_by_id: nil`),
staff review (`:staff_review`), or user attestation (`:attestation`).

## Recording a determination

`Strata::Determinable` (`app/models/concerns/strata/determinable.rb`) adds
`has_many :determinations, as: :subject, dependent: :destroy` and a convenience method. It is
**included by default in `Strata::ApplicationForm`**, and can be included in any other model.

```ruby
record.record_determination!(
  decision_method: :automated,
  reasons: ["pregnant_member"],
  outcome: :automated_exemption,
  determination_data: RulesEngine.new(ruleset).evaluate(:pregnant_member).reasons,
  determined_at: Time.current
)
```

`record_determination!(decision_method:, reasons:, outcome:, determination_data:, determined_at:,
determined_by_id: nil)` creates the determination (raising `ActiveRecord::RecordInvalid` on
validation failure). `determination_data` is intended to hold the rules-engine output (e.g. the
rules-engine reasons array).

## Query scopes

`Strata::Determination` ships rich scopes:

- Subject: `for_subject`, `for_subjects`, `for_subject_type`, `for_subject_id(id, type = nil)`.
- Attributes: `with_decision_method`, `with_reason` (Postgres array overlap `&&`), `with_outcome`,
  `determined_by(user_id)`.
- Time: `determined_before`, `determined_after`, `determined_between(start, end)`.
- Ordering: `latest_first`, `oldest_first`.

## Gotchas

- Unlike `Strata::Auditable`, `Determinable` uses `dependent: :destroy`, so determinations are
  deleted with their subject. Use the audit log for history that must outlive the record.
- `reasons` is a Postgres array column — `with_reason` builds `reasons && ARRAY[...]::varchar[]`.
