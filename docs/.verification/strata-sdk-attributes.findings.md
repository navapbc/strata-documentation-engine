# Verification findings: strata-sdk-attributes (round 1)

Doc: `docs/sources/strata-sdk/strata-sdk-attributes.md`
Source: `.sources/strata-sdk`

## Summary

Re-verified the entire doc against the source from scratch (not trusting prior rounds). The single
low-severity issue raised in round 2 — the `year_quarter` serialized form being written as the
ambiguous `"YYYYQQ"` — is now **fixed** in the doc. Line 149 now reads `"<year>Q<qq>"` with a
literal `Q` separator and zero-padded quarter, e.g. `"2023Q02"`, and explicitly notes that
`cast` parses it back via `value.split("Q")`. This exactly matches
`app/models/strata/year_quarter.rb:61-63` (`to_s` = `"#{year}Q#{quarter.to_s.rjust(2, '0')}"`) and
`app/lib/strata/attributes/year_quarter_attribute.rb:45-50` (`value.split("Q")`).

No new discrepancies found. Every claim in the doc is supported by the source.

## Items re-checked and confirmed correct

- **`Strata::Attributes` concern + `strata_attribute` DSL** — `ActiveSupport::Concern`; dispatch on
  `array:` (→ `array_attribute`) then `range:` (→ `range_attribute`), else
  `respond_to?("#{type}_attribute")`, else fallback `attribute name, type`
  (`app/lib/strata/attributes.rb:20-31,70-90`). The ten included modules listed in the doc match
  lines 22-31 exactly.
- **`resolve_class(type)`** — `"Strata::#{type.to_s.camelize}".constantize` with global-namespace
  fallback (`app/lib/strata/attributes.rb:36-42`).
- **`:address` → `Strata::Address`** — 5 string columns (`<name>_street_line_1/2`, `_city`,
  `_state`, `_zip_code`); accessors + `to_s`/`blank?`/`empty?`/`present?`; presence validations on
  `street_line_1`/`city`/`state`, `state` length `{ is: 2 }`, zip format
  `/\A\d{5}(-\d{4})?\z/` (`app/models/strata/address.rb:24-49`,
  `app/lib/strata/attributes/address_attribute.rb:30-38`). The `to_s` example
  `"123 Main St, Anytown, CA 12345"` is correct (line 47-49 joins with `, ` and drops blanks).
  The `street_line_*` vs `street_address_line_*` note is real — `street_address_line_*` /
  `residential_street_address_line_*` appear in `docs/intake-application-forms.md:107` and
  `docs/strata-sdk-components.md:25-31`.
- **`:name` → `Strata::Name`** — four components incl. `suffix`, `full_name`/`to_s`, `Comparable`
  ordered by `[last, first, middle, suffix]`, no presence validations
  (`app/models/strata/name.rb:22-25,51-53`; `name_attribute.rb:36-41`). The discrepancy note is
  real — `docs/strata-attributes.md:294` lists only `first/middle/last` and `docs/generators.md:98`
  says "first, middle, and last name"; the migration generator does create a `<name>_suffix:string`
  column (`lib/generators/strata/migration/migration_generator.rb:51-57`).
- **`:money` → `Strata::Money`** — single integer (cents) column; `cents`, `dollar_amount`
  (`BigDecimal`), `to_s` via `number_to_currency`; `+`/`-` require a `Money` else `TypeError`,
  `*` rounds, `/` floors; `cents=` accepts Integer or String
  (`app/models/strata/money.rb:28-100`). `Strata::Money.new(cents: 7500000)` → `"$75,000.00"` is
  consistent (ActiveModel keyword init; `MoneyType` also builds via `cents:`,
  `money_attribute.rb:39-64`). Schema confirms `salary` is `t.integer`
  (`spec/dummy/db/schema.rb:124`).
- **`:tax_id` → `Strata::TaxId`** — single string column; `TaxId < String`, initializer strips
  non-digits, `formatted` → `XXX-XX-XXXX` only when length 9 else raw, `to_s` = raw digits
  (`app/models/strata/tax_id.rb:19-36`). The `tax_id_attribute` DSL adds
  `format: { with: /\A\d{9}\z/, message: :invalid_tax_id }, allow_nil: true` on the host model and
  the value object itself does not validate (`tax_id_attribute.rb:48-51`; constant at
  `tax_id.rb:22`). Schema confirms `ssn`/`tax_id` are `t.string`
  (`spec/dummy/db/schema.rb:125,157`).
- **`:us_date` → `Strata::USDate`** — `USDate < Date`, parses `MM/DD/YYYY` + `YYYY-MM-DD` via
  `USDate.cast`, `nil` on unparseable input (`app/models/strata/us_date.rb:7-39`).
- **`:memorable_date`** — single date column; custom `MemorableDate` type accepting
  `{ year:, month:, day: }` parsed strictly via `Date.strptime(...)`; generated `validate_<name>`
  adds `:invalid_date` when type-casting fails; registers multi-parameter expansion
  `[:month, :day, :year]` (`app/lib/strata/attributes/memorable_date_attribute.rb:31-71`). Schema
  shows date columns for memorable/us dates (`spec/dummy/db/migrate/...:48,61`).
- **`:year_month` → `Strata::YearMonth` / `:year_quarter` → `Strata::YearQuarter`** — each a single
  string column; `"YYYY-MM"` (`year_month.rb:67-69`) / `"<year>Q<qq>"` e.g. `"2023Q02"`
  (`year_quarter.rb:61-63`); `Comparable`, integer `+`/`-` that roll over
  (`year_month.rb:28-39`, `year_quarter.rb:28-39`), `to_date_range` returning a
  `Strata::DateRange` (`year_month.rb:46-61`, `year_quarter.rb:46-59`); `month in 1..12` /
  `quarter in 1..4` validations (`year_month.rb:26`, `year_quarter.rb:26`). Schema confirms
  `reporting_period`/`activity_reporting_period` are single `t.string` columns
  (`spec/dummy/db/schema.rb:167-168`; migration
  `20250909235600_refactor_year_quarter_year_month_to_single_columns.rb`).
- **`:range` (`range: true`) → `Strata::ValueRange`** — `ValueRange[ValueClass]` builds a typed
  subclass with `start`/`end` of the underlying value type, `include?`, and a start≤end validation
  (`app/models/strata/value_range.rb:14-16,25-38,42-56`); maps to `<name>_start` + `<name>_end`
  columns via `range_attribute` → `basic_value_object_attribute`
  (`range_attribute.rb:38-44`, `basic_value_object_attribute.rb:32-39`). Pre-built
  `Strata::DateRange = ValueRange[USDate]` (`date_range.rb:4`) and
  `Strata::YearQuarterRange = ValueRange[YearQuarter]` (`year_quarter_range.rb:4`).
- **`array: true` → `ArrayAttribute`** — single jsonb column with default `[]`; serialize via
  `to_json`, deserialize via `item_class.new(item_hash)`; generated `validate_<name>` adds
  `:invalid_array` if any contained ActiveModel item is `invalid?`; nested-range syntax
  `[:type, range: true]`; arrays-of-arrays rejected; the TSS-147 TODO about native Ruby items not
  being validated (`app/lib/strata/attributes/array_attribute.rb:53-119`). Schema confirms array
  attributes are `t.jsonb` (`spec/dummy/db/schema.rb:161-166`).
- **Gotchas** — multi-column types need expanded migration columns and the migration generator maps
  types to columns automatically, mapping `year_month`/`year_quarter` to a single `<name>:string`
  column (`lib/generators/strata/migration/migration_generator.rb:28-69`).

## Findings

(none — the doc is fully supported by the source)
