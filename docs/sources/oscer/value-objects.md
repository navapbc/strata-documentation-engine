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
summary: How OSCER subclasses Strata::ValueObject for Member and MemberStatus, including the attribute-based equality/blank/serialization contract.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/models/member.rb
    - reporting-app/app/models/member_status.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — value objects

OSCER uses `Strata::ValueObject` for read-only domain values that are derived from aggregates rather
than persisted on their own. Two examples are `Member` and `MemberStatus`.

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
</content>
