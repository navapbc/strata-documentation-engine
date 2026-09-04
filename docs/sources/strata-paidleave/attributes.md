---
id: example-strata-paidleave-attributes
title: Typed attributes (strata_attribute)
source: strata-paidleave
doc_type: example
tags: [example-app, attributes, typed-attributes, schema]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-application-forms
  - example-strata-paidleave-value-objects
  - example-strata-paidleave-form-builder
demonstrates:
  - attributes
  - attribute-types/name
  - attribute-types/address
  - attribute-types/tax-id
  - attribute-types/us-date
  - attribute-types/memorable-date
summary: Every strata_attribute declaration in the paid leave app, how each type maps to columns and to permitted flow fields, and why the app reaches for :us_date instead of Rails' default date cast.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/models/leave_application.rb
    - paidleave/app/models/leave_application_employment_details.rb
    - paidleave/app/models/leave_period.rb
    - paidleave/app/models/leave_period_change.rb
    - paidleave/app/models/benefit_payment.rb
    - paidleave/app/models/employee_wage_record.rb
    - paidleave/app/models/exemption_request.rb
    - paidleave/app/models/quarterly_wage_report_form.rb
    - paidleave/app/models/contribution_payment_form.rb
    - paidleave/app/models/flows/leave_application_flow.rb
    - paidleave/app/serializers/leave_application_case_serializer.rb
    - paidleave/app/components/leave_application_case_row_component.rb
    - paidleave/db/schema.rb
last_documented: 2026-09-04
verified: ok
---

# Typed attributes

Nine models in the app declare typed attributes. Two ways in:

- `Strata::ApplicationForm` subclasses get the DSL from the base class
  (`LeaveApplication`, `QuarterlyWageReportForm`, `ContributionPaymentForm`, and
  `ExemptionRequest` — which additionally does `include Strata::Attributes` explicitly on top of
  the base class).
- Plain `ApplicationRecord` models mix it in: `include Strata::Attributes`
  (`LeavePeriod`, `LeavePeriodChange`, `BenefitPayment`, `EmployeeWageRecord`,
  `LeaveApplicationEmploymentDetails`).

## The full inventory

| Model | Declaration | Type |
|---|---|---|
| `LeaveApplication` | `strata_attribute :applicant_name, :name` | name |
| `LeaveApplication` | `strata_attribute :residential_address, :address` | address |
| `LeaveApplication` | `strata_attribute :mailing_address, :address` | address |
| `LeaveApplication` | `strata_attribute :tax_identifier, :tax_id` | tax id |
| `LeaveApplication` | `strata_attribute :date_of_birth, :memorable_date` | memorable date |
| `LeaveApplicationEmploymentDetails` | `strata_attribute :employer_notification_date, :us_date` | US date |
| `LeavePeriod` | `strata_attribute :start_date, :us_date` / `:end_date, :us_date` | US date |
| `LeavePeriodChange` | `strata_attribute :start_date, :us_date` / `:end_date, :us_date` | US date |
| `BenefitPayment` | `strata_attribute :pay_period_start_date, :us_date` / `:pay_period_end_date, :us_date` | US date |
| `ExemptionRequest` | `strata_attribute :plan_effective_date, :us_date` / `:plan_expiration_date, :us_date` | US date |
| `EmployeeWageRecord` | `strata_attribute :employee_name, :name` | name |
| `EmployeeWageRecord` | `strata_attribute :taxpayer_id, :tax_id` | tax id |
| `EmployeeWageRecord` | `strata_attribute :gross_wages, :money` / `:contributions_withheld, :money` | money |
| `QuarterlyWageReportForm` | `strata_attribute :reporting_period, :year_quarter` | year quarter |
| `QuarterlyWageReportForm` | `strata_attribute :employer_ein, :tax_id` | tax id |
| `QuarterlyWageReportForm` | `strata_attribute :total_gross_wages, :money` / `:total_taxable_wages, :money` | money |
| `ContributionPaymentForm` | `strata_attribute :payment_amount, :money` | money |
| `ContributionPaymentForm` | `strata_attribute :reporting_period, :year_quarter` | year quarter |
| `ContributionPaymentForm` | `strata_attribute :period_due, :money` / `:past_due_balance, :money` / `:total_due, :money` | money |
| `ContributionPaymentForm` | `strata_attribute :due_date, :us_date` | US date |

The `:money` and `:year_quarter` types are covered in [value objects](./value-objects.md); this doc
covers the rest.

## How each type maps to columns

The schema shows the expansion. `:name` becomes four string columns and `:address` five:

```ruby
# db/schema.rb — create_table "leave_applications"
t.string "applicant_name_first"
t.string "applicant_name_middle"
t.string "applicant_name_last"
t.string "applicant_name_suffix"
# ...
t.string "residential_address_street_line_1"
t.string "residential_address_street_line_2"
t.string "residential_address_city"
t.string "residential_address_state"
t.string "residential_address_zip_code"
# ...
t.date "date_of_birth"      # :memorable_date
t.string "tax_identifier"   # :tax_id
```

| Type | Columns | Reads back as |
|---|---|---|
| `:name` | `<attr>_first`, `_middle`, `_last`, `_suffix` | a composite object; also readable per part |
| `:address` | `<attr>_street_line_1`, `_street_line_2`, `_city`, `_state`, `_zip_code` | a composite object with those readers |
| `:memorable_date` | one `date` column | a `Date` |
| `:us_date` | one `date` column | a `Strata::USDate` (a `Date` subclass) |
| `:tax_id` | one `string` column | a `Strata::TaxId` — a `String` subclass, so `last(4)` works; it also offers `formatted` |

Both halves of that are exercised in the case serializer, which reads the composite for an address
and the expanded columns for the name:

```ruby
# app/serializers/leave_application_case_serializer.rb
first_name: @application.applicant_name_first,
last_name: @application.applicant_name_last,
date_of_birth: @application.date_of_birth&.iso8601,
tax_identifier_last_four: @application.tax_identifier&.last(4),
residential_address: address_json(@application.residential_address),
# ...
def address_json(address)
  return if address.blank?

  {
    street_line_1: address.street_line_1,
    street_line_2: address.street_line_2,
    city: address.city,
    state: address.state,
    zip_code: address.zip_code
  }
end
```

`tax_identifier&.last(4)` works because a `:tax_id` reads back as a `Strata::TaxId`, a `String`
subclass (it also offers `formatted` for display) — the SSN is masked to its last four digits for the
API, matching what the staff UI exposes.

A `:name` composite is renderable as-is; the staff case queue prints the whole name without touching
the parts:

```ruby
# app/components/leave_application_case_row_component.rb
def applicant_name
  app&.applicant_name ? app.applicant_name : "—"
end
```

For the multi-column types (`:name`, `:address`), validations name the **expanded** columns, never
the composite:

```ruby
# app/models/leave_application.rb
validates :applicant_name_first, presence: true, on: Flow::NAME
validates :residential_address_street_line_1, presence: true, on: Flow::ADDRESSES
validates :residential_address_zip_code, presence: true, on: Flow::ADDRESSES
```

Single-column types validate under their own attribute name instead —
`EmployeeWageRecord` validates `:taxpayer_id` (a `:tax_id`) and `:gross_wages` (a `:money`) directly.

A flow page's permitted `fields:` follow the same expansion, with two exceptions: `:memorable_date`
is permitted as a nested hash of its three inputs, and `question_page :tax_identifier` declares no
`fields:` at all — its single column is derived from the page name:

```ruby
# app/models/flows/leave_application_flow.rb
question_page :name, fields: [
  :applicant_name_first, :applicant_name_middle, :applicant_name_last, :applicant_name_suffix
]
question_page :addresses, fields: [
  :residential_address_street_line_1, ..., :mailing_address_zip_code
]
question_page :date_of_birth, fields: [
  date_of_birth: [ :month, :day, :year ]
]
question_page :tax_identifier
```

Copying an address between two `:address` attributes is a loop over the suffixes:

```ruby
# app/models/leave_application.rb — "same as residential" checkbox
def resolve_accepts_mail
  if accepts_mail?
    [ "street_line_1", "street_line_2", "city", "state", "zip_code" ].each do |suffix|
      send("mailing_address_#{suffix}=", send("residential_address_#{suffix}"))
    end
  end
end
```

## Why `:us_date` is everywhere

`:us_date` is the app's most-used type. Two models spell out the reason — `BenefitPayment` and
`ExemptionRequest`; the USWDS date picker posts `MM/DD/YYYY`, which Rails' default date cast
misreads. `BenefitPayment`'s comment points at `LeavePeriod` / `LeavePeriodChange` as following the
same rule; those two and `LeaveApplicationEmploymentDetails` carry bare declarations:

```ruby
# app/models/benefit_payment.rb
# Cast pay-period dates as US dates so the USWDS date_picker's MM/DD/YYYY
# submission round-trips correctly (Rails' default date cast reads slash-dates
# as DD/MM). Mirrors LeavePeriod / LeavePeriodChange.
strata_attribute :pay_period_start_date, :us_date
strata_attribute :pay_period_end_date, :us_date
```

```ruby
# app/models/exemption_request.rb
# Entered through the date picker as mm/dd/yyyy; :us_date parses that format.
# Without it Rails reads "12/25/2026" as a 25th month and silently nils it.
strata_attribute :plan_effective_date, :us_date
```

The pairing to remember: **`f.date_picker` in the view ⇒ `:us_date` on the model.** The one date
that is *not* `:us_date` is `date_of_birth`, which is entered as three separate month/day/year
inputs (`f.memorable_date`) and so never sees a slash-date. The reverse does not hold: a `:us_date`
column need not have a picker at all — `ContributionPaymentForm#due_date` is a system-set ledger
value under a "Server-derived ledger values. No `question_page`" comment, never rendered through
`date_picker`. See [form builder](./form-builder.md).

Because `Strata::USDate` subclasses `Date`, plain date logic and the `validates_date` matcher
work unchanged:

```ruby
# app/models/leave_period.rb
validates_date :end_date, on_or_after: :start_date, allow_nil: true, on: LeaveApplication::Flow::LEAVE_DATES

def started?
  !start_date.future?
end
```

## `:tax_id` with an accompanying type enum

`EmployeeWageRecord` pairs its `:tax_id` with an app-level enum, because the program needs to know
which kind of identifier was given:

```ruby
# app/models/employee_wage_record.rb
enum :taxpayer_id_type, ssn: 0, itin: 1

strata_attribute :taxpayer_id, :tax_id

validates :taxpayer_id_type, presence: true
validates :taxpayer_id, presence: true
```

The SDK type handles the input formatting and storage; the discriminator is the app's own column.
