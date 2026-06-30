---
id: strata-sdk-attributes
title: Strata attributes and attribute types
source: strata-sdk
doc_type: feature
tags: [strata-sdk, attributes, value-object, data-modeler]
related:
  - strata-sdk-application-form
  - strata-sdk-form-builder
  - strata-sdk-generators
feature_keys:
  - attributes
  - attribute-types/address
  - attribute-types/money
  - attribute-types/name
  - attribute-types/us-date
  - attribute-types/memorable-date
  - attribute-types/tax-id
  - attribute-types/year-month
  - attribute-types/year-quarter
  - attribute-types/range
  - attribute-types/array
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The strata_attribute DSL and the full catalog of Strata attribute types (address, money, name, dates, tax id, ranges, arrays).
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/lib/strata/attributes.rb
    - app/lib/strata/attributes/address_attribute.rb
    - app/lib/strata/attributes/array_attribute.rb
    - app/lib/strata/attributes/memorable_date_attribute.rb
    - app/lib/strata/attributes/tax_id_attribute.rb
    - app/lib/strata/attributes/year_month_attribute.rb
    - app/lib/strata/attributes/year_quarter_attribute.rb
    - app/models/strata/address.rb
    - app/models/strata/name.rb
    - app/models/strata/money.rb
    - app/models/strata/tax_id.rb
    - app/models/strata/us_date.rb
    - app/models/strata/year_month.rb
    - app/models/strata/year_quarter.rb
    - app/models/strata/value_range.rb
    - app/models/strata/date_range.rb
    - app/models/strata/year_quarter_range.rb
    - docs/strata-attributes.md
verified: ok
last_documented: 2026-06-29
---

# Strata attributes and attribute types

`Strata::Attributes` (`app/lib/strata/attributes.rb`) is an `ActiveSupport::Concern` that adds the
`strata_attribute` DSL to a model. Include it directly, or inherit from `Strata::ApplicationForm`
(which includes it for you).

```ruby
class MyModel < ApplicationRecord
  include Strata::Attributes

  strata_attribute :applicant_name, :name
  strata_attribute :home_address, :address
  strata_attribute :salary, :money
end
```

## The `strata_attribute` DSL

`strata_attribute(name, type, options = {})` dispatches on `type` and on two boolean options:

- `array: true` → routes to `array_attribute` (a single jsonb column holding an array of value
  objects).
- `range: true` → routes to `range_attribute` (a `Strata::ValueRange` with `_start`/`_end`
  columns).
- Otherwise, if the model responds to `"#{type}_attribute"` it calls that; if not, it falls back
  to plain `ActiveModel`/`ActiveRecord` `attribute name, type`.

`resolve_class(type)` maps a type symbol to `Strata::<Type>` (falling back to the global
namespace). The supported attribute modules are mixed in by `Strata::Attributes`:
`AddressAttribute`, `ArrayAttribute`, `MemorableDateAttribute`, `MoneyAttribute`, `NameAttribute`,
`RangeAttribute`, `TaxIdAttribute`, `USDateAttribute`, `YearMonthAttribute`, `YearQuarterAttribute`.

## Attribute types

### `:address` → `Strata::Address`

Maps to **5 string columns** prefixed by the attribute name: `<name>_street_line_1`,
`<name>_street_line_2`, `<name>_city`, `<name>_state`, `<name>_zip_code`. The value object exposes
`street_line_1`, `street_line_2`, `city`, `state`, `zip_code`, plus `to_s`, `blank?`, `empty?`,
`present?`. Validations: `street_line_1`, `city`, `state` present; `state` exactly 2 chars;
`zip_code` matching `/\A\d{5}(-\d{4})?\z/`.

```ruby
form.mailing_address = { street_line_1: "123 Main St", city: "Anytown", state: "CA", zip_code: "12345" }
form.mailing_address.to_s   # => "123 Main St, Anytown, CA 12345"
```

> Note: the value-object component is named `street_line_1` (not `street_address_line_1`). Some SDK
> docs/examples use `street_address_line_*`; the actual attributes are `street_line_*`.

### `:name` → `Strata::Name`

Maps to columns prefixed by the attribute name. The value object has **four** components —
`first`, `middle`, `last`, **and `suffix`** — plus `full_name`/`to_s`, `blank?`, `empty?`,
`present?`, and `Comparable` (sorts by last, first, middle, suffix). There are no built-in
presence validations on names.

> Discrepancy: `docs/strata-attributes.md` and `docs/generators.md` describe Name as first/middle/
> last only; the code (`app/models/strata/name.rb`) also defines a `suffix` component.

### `:money` → `Strata::Money`

A single integer column storing **cents**. Constructed with `Strata::Money.new(cents: 7500000)`.
Provides `cents`, `dollar_amount` (a `BigDecimal`), `to_s` (e.g. `"$75,000.00"` via
`number_to_currency`), `Comparable`, and arithmetic: `+`/`-` require another `Money` (raise
`TypeError` otherwise); `*`/`/` take a scalar (`*` rounds, `/` floors to the cent). `cents=`
accepts an `Integer` or a `String` of digits.

### `:tax_id` → `Strata::TaxId`

A single string column. `Strata::TaxId` subclasses `String`; its initializer strips all non-digits,
so it stores raw digits. `formatted` returns `XXX-XX-XXXX` when length is 9 (otherwise the raw
value); `to_s` is the raw digits.

The `:tax_id` attribute DSL (`tax_id_attribute`, in
`app/lib/strata/attributes/tax_id_attribute.rb`) adds the validation
`format: { with: /\A\d{9}\z/, message: :invalid_tax_id }, allow_nil: true` on the host model
(`Strata::TaxId::TAX_ID_FORMAT_NO_DASHES` is the `/\A\d{9}\z/` constant in
`app/models/strata/tax_id.rb`). The `TaxId` value object itself does not validate — it only stores
stripped digits and exposes `formatted`.

### `:us_date` → `Strata::USDate`

A single date column. `Strata::USDate` subclasses `Date` and parses US format `MM/DD/YYYY` (and ISO
`YYYY-MM-DD`) via `USDate.cast`, returning `nil` on unparseable input.

### `:memorable_date`

A single date column backed by a custom `MemorableDate` ActiveModel type that additionally accepts a
hash `{ year:, month:, day: }` (parsed strictly with `Date.strptime`). A generated
`validate_<name>` adds an `:invalid_date` error when type-casting fails. Registers multi-parameter
expansion so form params permit `[:month, :day, :year]`.

### `:year_month` → `Strata::YearMonth` and `:year_quarter` → `Strata::YearQuarter`

Each maps to a **single string column** (`<name>`), serialized as `"YYYY-MM"` (`year_month`) /
`"<year>Q<qq>"` with a literal `Q` separator and zero-padded quarter, e.g. `"2023Q02"`
(`year_quarter`, which `cast` parses back via `value.split("Q")`), via a custom ActiveModel type. The value object still exposes `year` +
`month`/`quarter` accessors, is `Comparable`, supports integer `+`/`-` arithmetic that rolls over
correctly, and provides `to_date_range` (a `Strata::DateRange`). `YearMonth` validates `month` in
`1..12`; `YearQuarter` validates `quarter` in `1..4`.

### `:range` (`range: true`) → `Strata::ValueRange`

`Strata::ValueRange[ValueClass]` builds a typed range subclass with `start`/`end` attributes of the
underlying value type, an `include?(value)` test, and a validation that `start` is not greater than
`end`. Pre-built specializations: `Strata::DateRange = ValueRange[USDate]` and
`Strata::YearQuarterRange = ValueRange[YearQuarter]`. Maps to `<name>_start` + `<name>_end` columns.

```ruby
strata_attribute :coverage_period, :us_date, range: true
```

### `array: true` → `ArrayAttribute`

Stores an array of value objects in a **single jsonb column** (default `[]`). Serializes with
`to_json`, deserializes by instantiating `item_class.new(item_hash)`. A generated `validate_<name>`
marks the attribute `:invalid_array` if any contained ActiveModel item is `invalid?`. Arrays of
ranges use the nested syntax `strata_attribute :periods, [:us_date, range: true], array: true`
(arrays-of-arrays are rejected).

## Gotchas

- Multi-column types (`address`, `name`, ranges) need their expanded columns in the migration; use
  the Strata migration generator, which maps types to columns automatically (it maps `year_month`
  and `year_quarter` to a single `<name>:string` column).
- Array items that are native Ruby types (not ActiveModel value objects) are not validated by the
  generated array validator (see the `TODO`/`TSS-147` note in `array_attribute.rb`).
