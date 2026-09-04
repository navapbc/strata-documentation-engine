---
id: example-strata-paidleave-value-objects
title: Money and YearQuarter value objects
source: strata-paidleave
doc_type: example
tags: [example-app, value-object, money, year-quarter, workaround]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-attributes
  - example-strata-paidleave-application-forms
  - example-strata-paidleave-form-builder
demonstrates:
  - value-object
  - attribute-types/money
  - attribute-types/year-quarter
summary: How the paid leave app constructs, compares and formats Strata::Money and Strata::YearQuarter, plus the MoneyInput concern that works around Strata::FormBuilder posting money as a String the SDK's own type casts to nil.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/models/concerns/money_input.rb
    - paidleave/app/models/concerns/reporting_periods.rb
    - paidleave/app/models/employee_wage_record.rb
    - paidleave/app/models/contribution_payment_form.rb
    - paidleave/app/models/quarterly_wage_report_form.rb
    - paidleave/app/models/benefit_payment.rb
    - paidleave/app/services/payroll_file_importer.rb
    - paidleave/app/controllers/employers/contribution_payment_forms_controller.rb
    - paidleave/app/views/employers/quarterly_wage_report_forms/overview.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/index.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/edit_employer_details.html.erb
    - paidleave/app/views/employers/contribution_payment_forms/new.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/edit_period_and_method.html.erb
    - paidleave/db/schema.rb
last_documented: 2026-09-04
verified: ok
---

# Money and YearQuarter value objects

The app uses two of the SDK's value objects directly, not only as attribute types.

## `Strata::Money`

Money attributes persist to a single integer column of cents (`t.integer "payment_amount"`,
`t.integer "gross_wages"`), and read back as a `Strata::Money`. The app constructs them explicitly
in two places (plus `MoneyInput.coerce`) — three calls in the controller and two in the importer:

```ruby
# app/controllers/employers/contribution_payment_forms_controller.rb — seeded ledger values
period_due: Strata::Money.new(cents: 5_000),
past_due_balance: Strata::Money.new(cents: 0),
total_due: Strata::Money.new(cents: 5_000),
```

```ruby
# app/services/payroll_file_importer.rb
Strata::Money.new(cents: (decimal(row, column, row_number) * 100).round)
# ...and summing across rows:
Strata::Money.new(cents: records.sum { |record| record.gross_wages.cents })
```

The surface exercised:

| Call | Where |
|---|---|
| `Strata::Money.new(cents:)` | the controller and importer sites above, plus `MoneyInput.coerce` |
| `#cents` | `payroll_file_importer.rb`, `EmployeeWageRecord#monetary_amounts_not_negative` and its zero-wages guard, `ContributionPaymentForm#payment_amount_within_total_due` |
| comparison (`>`) with another `Money` | `ContributionPaymentForm#payment_amount_within_total_due` |

```ruby
# app/models/contribution_payment_form.rb
def payment_amount_within_total_due
  return if payment_amount.blank?

  if payment_amount.cents < 1
    errors.add(:payment_amount, :greater_than_zero)
  elsif total_due.present? && payment_amount > total_due
    errors.add(:payment_amount, :exceeds_total_due)
  end
end
```

Note the two idioms side by side: the "greater than zero" bound is expressed on `cents`, the upper
bound as a `Money`-to-`Money` comparison.

Assignment from another money attribute is a straight copy, no unwrapping:

```ruby
# "Full amount" means the ledger's total due, so the stored amount is
# derived rather than typed on that branch.
def apply_full_amount_option
  return unless full_amount?
  return if total_due.blank?

  self.payment_amount = total_due
end
```

### The MoneyInput workaround (an SDK gap)

This is the most important thing in this doc for anyone building a money form on the SDK. The app
carries a concern whose whole purpose is to patch a silent data loss:

```ruby
# app/models/concerns/money_input.rb
# Workaround for an SDK gap.
#
# `Strata::FormBuilder#money_field` renders a plain scalar input
# (`name="model[amount]"`), so the browser posts a String such as "12000.00".
# `Strata::Attributes::MoneyAttribute::MoneyType#cast` accepts Integer, a
# Strata::Money, or a Hash with a `dollar_amount` key — and returns **nil** for
# anything else, Strings included. The value a user types is therefore dropped
# silently: no cast error, no validation failure on the raw input, just nil.
#
# This concern wraps the writers for money attributes so a typed dollar string is
# converted the same way the Hash branch would convert it. Remove once the SDK's
# MoneyType casts strings.
module MoneyInput
  extend ActiveSupport::Concern

  # "$12,000.50" -> Strata::Money(cents: 1_200_050)
  def self.coerce(value)
    return value unless value.is_a?(String)
    return nil if value.blank?

    Strata::Money.new(cents: (value.delete("$, ").to_f * 100).round)
  end

  class_methods do
    def money_input(*names)
      names.each do |name|
        define_method(:"#{name}=") do |value|
          super(MoneyInput.coerce(value))
        end
      end
    end
  end
end
```

Used by the two models whose money fields a user actually types into:

```ruby
# app/models/contribution_payment_form.rb
include MoneyInput
money_input :payment_amount
```

```ruby
# app/models/employee_wage_record.rb
include MoneyInput
money_input :gross_wages, :contributions_withheld
```

The server-derived money attributes (`period_due`, `total_due`, `total_gross_wages`, ...) do **not**
need it, because the app assigns them a real `Strata::Money`.

`BenefitPayment` takes the opposite route for the same problem — its amount is a plain
`amount_cents` integer column with hand-written dollar accessors rather than a `strata_attribute`:

```ruby
# app/models/benefit_payment.rb
# Dollars view of the persisted integer-cents amount, so staff can enter a
# plain dollar figure (e.g. 500.00) on the payment form.
def amount
  amount_cents && amount_cents / 100.0
end

def amount=(dollars)
  self.amount_cents = dollars.present? ? (dollars.to_d * 100).round : nil
end
```

Two models, two answers to the same gap — worth knowing before you pick one.

## `Strata::YearQuarter`

`:year_quarter` attributes persist to a **string** column (`t.string "reporting_period"`). All of
the app's quarter arithmetic lives in one concern shared by both employer contribution forms:

```ruby
# app/models/concerns/reporting_periods.rb
# Included by QuarterlyWageReportForm and ContributionPaymentForm; both declare
# `strata_attribute :reporting_period, :year_quarter`, which this concern reads.
module ReportingPeriods
  extend ActiveSupport::Concern

  class_methods do
    # The most recently closed quarter — the one currently open for filing.
    def current_reporting_period(today = Date.current)
      quarter = ((today.month - 1) / 3) + 1
      Strata::YearQuarter.new(year: today.year, quarter: quarter) - 1
    end

    # The select lists past periods still open for original filing.
    def open_reporting_periods(count: 8, today: Date.current)
      current = current_reporting_period(today)
      Array.new(count) { |i| current - i }
    end
```

The value object surface, spread across the concern, `QuarterlyWageReportForm`, the payroll importer and two views:

| Call | Meaning | Used for |
|---|---|---|
| `Strata::YearQuarter.new(year:, quarter:)` | construct | `current_reporting_period`, the compliance-overview table |
| `period - n` | step back *n* quarters, crossing years | "most recently closed quarter", the 8-period option list |
| `#quarter`, `#year` | parts | labels, due dates, the QWR reference number |
| `#to_date_range` → `.start` / `.end` | the calendar span | the human label |
| `#to_s` | the persisted/round-trippable form (`"2026Q02"`) | select option values, uniqueness query; `PayrollFileImporter` normalizes CSV input to that same `"YYYYQNN"` string to compare against it |

Label formatting and the due-date table:

```ruby
# "Q2 2026 (Apr 1, 2026—Jun 30, 2026)" period label.
def reporting_period_label(period)
  return nil if period.blank?

  range = period.to_date_range
  "Q#{period.quarter} #{period.year} " \
    "(#{range.start.strftime('%b %-d, %Y')}—#{range.end.strftime('%b %-d, %Y')})"
end

# Quarter => [due month, due day]. Q4's due date falls in the following year.
# Defined at module level (ReportingPeriods::DUE_MONTH_DAY), above `class_methods do`;
# the two methods around it here are class methods, shown elided together.
DUE_MONTH_DAY = { 1 => [ 4, 30 ], 2 => [ 7, 31 ], 3 => [ 10, 31 ], 4 => [ 1, 31 ] }.freeze

def reporting_period_due_date(period)
  return nil if period.blank?

  month, day = DUE_MONTH_DAY.fetch(period.quarter)
  year = period.quarter == 4 ? period.year + 1 : period.year
  Date.new(year, month, day)
end
```

`#to_s` matters twice. Once for the select in
`app/views/employers/quarterly_wage_report_forms/edit_period_and_method.html.erb`, where the option
value must be something the SDK type can parse back:

```ruby
# [[label, value]] pairs for f.select. The value is what YearQuarterType
# parses back ("2026Q02").
def reporting_period_options(count: 8)
  open_reporting_periods(count: count).map do |period|
    [ reporting_period_label(period), period.to_s ]
  end
end
```

...and once when querying the column, which stores that same string:

```ruby
# app/models/quarterly_wage_report_form.rb
already_submitted = self.class
                        .submitted
                        .where(employer_ein: employer_ein, reporting_period: reporting_period.to_s)
                        .where.not(id: id)
                        .exists?
```

**Query a `:year_quarter` column with `period.to_s`, not the value object.**

The concern also supplies a fallback so a read-only label always has something to show before the
user picks a period:

```ruby
def effective_reporting_period
  reporting_period.presence || self.class.current_reporting_period
end

# Instance wrappers: same names as the class methods, but argument-free.
def reporting_period_label
  self.class.reporting_period_label(effective_reporting_period)
end

def reporting_period_due_date
  self.class.reporting_period_due_date(effective_reporting_period)
end
```

So each of those two names has **two call styles**. On the class you pass a period explicitly —
`QuarterlyWageReportForm.reporting_period_label(current_period)` and
`.reporting_period_due_date(current_period)` in
`app/views/employers/quarterly_wage_report_forms/index.html.erb:15,19`. On a form record you call it
with no argument and it defaults to `effective_reporting_period` — `@quarterly_wage_report_form
.reporting_period_label` in `edit_employer_details.html.erb:8`, `payment.reporting_period_label` in
`app/views/employers/contribution_payment_forms/new.html.erb:12`.

A view constructs quarters directly for a year-at-a-glance table:

```erb
<%# app/views/employers/quarterly_wage_report_forms/overview.html.erb %>
<% period = Strata::YearQuarter.new(year: Date.current.year, quarter: quarter) %>
```

## Gaps worth knowing

- `ReportingPeriods` opens with `NOTE: MUST be confirmed against statute before this is used for
  anything real` — the `DUE_MONTH_DAY` schedule is a placeholder.
- `reporting_period_open_for_original_filing` can only match on the EIN captured on the record; its
  `TODO` notes that multi-employer (third-party administrator) filing is unhandled.
- `MoneyInput` is explicitly temporary: "Remove once the SDK's MoneyType casts strings."
