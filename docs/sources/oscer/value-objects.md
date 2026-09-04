---
id: example-oscer-value-objects
title: OSCER — value objects
source: oscer
doc_type: example
tags: [example-app, oscer, value-object, immutable, equality]
related:
  - example-oscer-overview
  - example-oscer-attributes
  - example-oscer-determinations
demonstrates: [value-object]
integrates_with: [documentai-api]
summary: How OSCER subclasses Strata::ValueObject for Member, MemberStatus, and DocAiResult, including the attribute-based equality/blank/serialization contract.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/member.rb
    - reporting-app/app/models/member_status.rb
    - reporting-app/app/models/doc_ai_result.rb
    - reporting-app/app/models/doc_ai_result/payslip.rb
    - reporting-app/app/adapters/doc_ai_adapter.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — value objects

OSCER uses `Strata::ValueObject` for read-only domain values that are derived from aggregates (or
from an external response) rather than persisted on their own. Three examples are `Member`,
`MemberStatus`, and `DocAiResult`.

**Read the base class before assuming.** Only these three classes extend `Strata::ValueObject`
directly (plus `DocAiResult`'s own subclasses, such as
`DocAiResult::Payslip` in `reporting-app/app/models/doc_ai_result/payslip.rb`). The
app has its own, separate `ValueObject` base (`reporting-app/lib/value_object.rb`, an
`ActiveModel::Model` + `Attributes` + JSON-serializer bundle whose `==` compares `as_json`), and
that is what the many other value objects in the app extend — the `Determinations::*` determination
payloads, `Verification::DataSourceResult` / `OrchestrationResult`, the `Api::*` request/response
models, and the `Certifications::*` certification-data objects. Its class comment says it is "very
similar to `Strata::ValueObject`, possibly can be replaced by it" but is kept as a place to iterate.
So a bare `< ValueObject` in this app is **not** an SDK value object.

## Member

`Member < Strata::ValueObject` (`app/models/member.rb`) is a lightweight projection of a member's
identity, built from a `Certification` (the app does not yet have a persisted member record):

```ruby
class Member < Strata::ValueObject
  include Strata::Attributes

  strata_attribute :member_id, :string
  strata_attribute :email, :string
  strata_attribute :name, :name

  def self.from_certification(certification)
    Member.new(
      member_id: certification.member_id,
      email: certification.member_email,
      name: certification.member_name
    )
  end
end
```

The value object declares its fields with `strata_attribute` (including the `:name` type that
resolves to `Strata::Name`; see [attributes](./attributes.md)) and is constructed by class factory
methods (`from_certification`, `find_by_member_id`, `search_by_email`).

## MemberStatus and the value-object contract

`MemberStatus < Strata::ValueObject` (`app/models/member_status.rb`) captures a member's current
certification status, its determination method, and reason codes:

```ruby
class MemberStatus < Strata::ValueObject
  include Strata::Attributes
  strata_attribute :status, :string
  strata_attribute :determination_method, :string
  strata_attribute :reason_codes, :string, array: true
  strata_attribute :human_readable_reason_codes, :string, array: true

  # NOT a strata_attribute — see below
  attr_accessor :latest_determination

  validates :status, presence: true,
    inclusion: { in: [ AWAITING_REPORT, EXEMPT, COMPLIANT, NOT_COMPLIANT, PENDING_REVIEW ] }
end
```

This model documents the `Strata::ValueObject` contract precisely. The `latest_determination`
accessor is **deliberately a plain `attr_accessor`, not a `strata_attribute`**, and the source notes
the consequences of that choice for the SDK's value-object semantics:

- it is excluded from `#attributes`;
- it is excluded from `#blank?` (which inspects `attributes.values`);
- it is excluded from `Strata::ValueObject#==` — two `MemberStatus` instances with the same
  attribute fields but different `latest_determination` records compare **equal**, because the SDK's
  equality compares `attributes` only;
- it is excluded from JSON serialization.

The reason given is that `Strata::ValueObject`'s `ActiveModel::Attributes` backing only handles
primitive types, and a `Determination` record should not factor into value equality or `#blank?`.
This is the canonical illustration that `Strata::ValueObject` equality, `blank?`, and serialization
are defined over its `strata_attribute` set.

Validations work as on any `ActiveModel` object, and the value object adds derived query methods
(`dashboard_report_status`, `certification_period_completed?`) over its attributes.

## DocAiResult — wrapping an external response

`DocAiResult < Strata::ValueObject` (`app/models/doc_ai_result.rb`) is a value object over a document
extraction response returned by the `documentai-api` sidecar. `DocAiAdapter`
(`app/adapters/doc_ai_adapter.rb`) posts a document to the sidecar's `v1/documents` endpoint, and
`DocAiResult.from_response` dispatches the JSON envelope into the value object:

```ruby
class DocAiResult < Strata::ValueObject
  include Strata::Attributes

  strata_attribute :job_id, :string
  strata_attribute :status, :string
  strata_attribute :matched_document_class, :string
  strata_attribute :message, :string
  strata_attribute :created_at, :datetime
  strata_attribute :completed_at, :datetime
  strata_attribute :total_processing_time_seconds, :float
  strata_attribute :error, :string           # present when status == "failed"
  strata_attribute :additional_info, :string # present when status == "failed"

  # Factory: dispatches to the registered subclass for the matchedDocumentClass
  def self.from_response(response)
    klass = REGISTRY.fetch(response["matchedDocumentClass"], DocAiResult)
    klass.build(response)
  end
end
```

Beyond the `strata_attribute` envelope, `DocAiResult` keeps the raw extracted `fields` hash in a
plain `attr_reader` (frozen in `build`) — the same "plain accessor for non-primitive data" pattern
`MemberStatus` uses for `latest_determination`. It shows a value object used as the boundary type for
an external integration rather than an internal projection. (The broader DocAI pipeline is
app-specific and out of SDK scope; only the `Strata::ValueObject` usage is documented here.)
