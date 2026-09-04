---
id: example-oscer-attributes
title: OSCER — typed attributes and attribute types
source: oscer
doc_type: example
tags: [example-app, oscer, attributes, strata-attribute, types, money, dates]
related:
  - example-oscer-overview
  - example-oscer-application-forms
  - example-oscer-value-objects
demonstrates:
  - attributes
  - attribute-types/money
  - attribute-types/year-month
  - attribute-types/us-date
  - attribute-types/name
  - attribute-types/tax-id
  - attribute-types/range
  - attribute-types/array
summary: How OSCER uses the strata_attribute DSL and the SDK's money, year-month, us-date, name, tax-id, range, and array attribute types across forms, activities, and value objects.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/models/income_activity.rb
    - reporting-app/app/models/activity_report_application_form.rb
    - reporting-app/app/models/external_income_activity.rb
    - reporting-app/app/models/external_hourly_activity.rb
    - reporting-app/app/models/member.rb
    - reporting-app/app/models/member_status.rb
    - reporting-app/app/models/information_request.rb
    - reporting-app/app/models/activity.rb
    - reporting-app/app/models/certifications/member_data.rb
    - reporting-app/app/models/certifications/household_data.rb
    - reporting-app/app/models/certifications/requirements.rb
    - reporting-app/app/forms/demo/certifications/base_create_form.rb
    - reporting-app/app/helpers/activity_report_application_form_helper.rb
    - reporting-app/app/services/batch_upload_record_validator.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — typed attributes and attribute types

OSCER declares typed attributes throughout its models and forms with the SDK's `strata_attribute`
DSL (from `Strata::Attributes`), using several of the SDK's built-in attribute types.

## The `strata_attribute` DSL

A model or form mixes in `Strata::Attributes` and declares attributes by name and type. Plain Active
Record models, `Strata::ValueObject`s, and `ActiveModel`-based forms all use it. Examples:

```ruby
# app/models/activity.rb
class Activity < ApplicationRecord
  include Strata::Attributes
  strata_attribute :month, :date
  strata_attribute :name, :string
  strata_attribute :category, :string
end
```

```ruby
# app/models/information_request.rb
strata_attribute :application_form_id, :uuid
strata_attribute :due_date, :date
strata_attribute :member_comment, :text
```

The DSL accepts modifiers — `array: true` for a list of values and `range: true` for a value range.

## Array

Reporting periods on the activity-report form are lists, declared with `array: true`, and
`MemberStatus` stores its reason codes as string arrays:

```ruby
# app/models/activity_report_application_form.rb
strata_attribute :reporting_periods, :year_month, array: true
strata_attribute :months_that_can_be_certified, :year_month, array: true

# app/models/member_status.rb
strata_attribute :reason_codes, :string, array: true
strata_attribute :human_readable_reason_codes, :string, array: true
```

## Money

`IncomeActivity` (`app/models/income_activity.rb`) stores income as a `:money` attribute, and its
validation compares against a `Strata::Money` value object:

```ruby
class IncomeActivity < Activity
  include Strata::Attributes
  strata_attribute :income, :money

  def income_must_be_greater_than_zero
    if income.nil? || income <= Strata::Money.new(cents: 0)
      errors.add(:income, :greater_than, value: 0, count: 0)
    end
  end
end
```

The doc-AI review path also reads the money value's `cents` (`income&.cents`) to detect member
edits.

## Year-month

Reporting periods are months, modeled with the `:year_month` type (as arrays). The app constructs
`Strata::YearMonth` directly for display formatting:

```ruby
# app/models/activity_report_application_form.rb
"Months #{invalid.map { |month| Strata::YearMonth.new(month).strftime("%B %Y") }.join(', ')} are not valid..."
```

`reporting_period_dates` sorts and maps the `year_month` values (`.year`, `.month`) into `Date`s.
`ActivityReportApplicationFormHelper` shows a rough edge in the same area: it round-trips reporting
periods as `{ year:, month: }` JSON because array attributes can't yet be set from a `"2024-01"`
date string, and the helper carries the SDK ticket reference (TSS-375) for that gap.

## US date and range

External activity records store a reporting period as a **range of US dates**. In
`external_hourly_activity.rb` an inline comment notes the range gives it start/end validation for
free; `external_income_activity.rb` declares the identical attribute without that comment:

```ruby
# app/models/external_hourly_activity.rb
# DateRange provides built-in validation (start <= end)
strata_attribute :period, :us_date, range: true
```

The demo certification create form uses standalone `:us_date` attributes for member-entered dates:

```ruby
# app/forms/demo/certifications/base_create_form.rb
strata_attribute :date_of_birth, :us_date
strata_attribute :certification_date, :us_date
```

`Strata::USDate.cast(value)` is also used directly to parse incoming date strings in
`app/services/batch_upload_record_validator.rb`, and `Strata::DateRange` is constructed in
`app/models/certifications/requirements.rb` to express a certification's continuous lookback period.

## Name

A person's name uses the `:name` type, which decomposes into the SDK's `Strata::Name` value object
(with first/middle/last/suffix sub-fields):

```ruby
# app/models/member.rb
strata_attribute :name, :name

# app/forms/demo/certifications/base_create_form.rb
strata_attribute :member_name, :name
```

The demo form validates the decomposed sub-fields directly (`member_name_first`, `member_name_last`,
`member_name_middle`, `member_name_suffix`), showing how the `:name` type exposes its parts.

## Tax ID

A member's SSN is declared with the `:tax_id` type, in both the certification's member data and the
nested `Certifications::HouseholdData::Member` value object:

```ruby
# app/models/certifications/member_data.rb
# and Certifications::HouseholdData::Member in app/models/certifications/household_data.rb
strata_attribute :ssn, :tax_id
```

`HouseholdData::Member#same_person_as?` then treats that tax ID as authoritative when deduplicating
a household member against the applicant.

The same value objects also use SDK types **outside** the `strata_attribute` DSL, as Active Model
JSON types. Both declare `attribute :name, ActiveModel::Type::Json.new(Strata::Name)`, and
`member_data.rb` adds `attribute :address, ActiveModel::Type::Json.new(Strata::Address)`;
`household_data.rb`'s `Member` uses only the `Strata::Name` JSON type. That is a different mechanism
from the typed-attribute declarations above — the SDK's value class is reused as a serialization
type on a plain `attribute`.

For the value-object types these attributes resolve into, see [value objects](./value-objects.md).
