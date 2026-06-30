---
id: example-strata-unemployment-attributes
title: Typed strata_attribute declarations
source: strata-unemployment
doc_type: example
tags: [example-app, attributes, attribute-types]
related:
  - example-strata-unemployment-overview
  - example-strata-unemployment-application-form
  - example-strata-unemployment-form-builder
demonstrates:
  - attributes
  - attribute-types/name
  - attribute-types/memorable-date
  - attribute-types/address
  - attribute-types/tax-id
summary: The strata_attribute DSL declarations the unemployment portal uses, and the name/memorable-date/address/tax-id attribute types they select.
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/models/unemployment_benefits_application_form.rb
    - unemployment/db/migrate/20260319000000_create_unemployment_benefits_application_forms.rb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_identity.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_contact.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_most_recent_employer.html.erb
verified: ok
last_documented: 2026-06-29
---

# Typed `strata_attribute` declarations

The application model declares five typed attributes with the SDK's `strata_attribute` DSL:

```ruby
# app/models/unemployment_benefits_application_form.rb
strata_attribute :claimant_name, :name
strata_attribute :date_of_birth, :memorable_date
strata_attribute :mailing_address, :address
strata_attribute :employer_address, :address
strata_attribute :claimant_ssn, :tax_id
```

Each declaration is `strata_attribute <name>, <type>`, where `<type>` selects a Strata attribute
type. This app exercises four of them.

## `:name` — `claimant_name`

A name attribute expands into the constituent name columns. The migration documents the mapping:

```ruby
# db/migrate/20260319000000_create_unemployment_benefits_application_forms.rb
# identity (claimant_name is a strata :name attribute -> _first, _middle, _last)
t.string :claimant_name_first
t.string :claimant_name_middle
t.string :claimant_name_last
```

The model validates the expanded columns directly
(`validates :claimant_name_first, presence: true, on: Flow::IDENTITY`), and the review page renders
the composed value via `claimant_name.to_s`. The matching form field is `f.name :claimant_name`
(see [form builder](./form-builder.md)).

## `:memorable_date` — `date_of_birth`

A memorable-date attribute captures a date as separate month/day/year inputs. The flow declares the
sub-parts (`date_of_birth: [ :month, :day, :year ]`) and the identity form renders it with
`f.memorable_date :date_of_birth`. The column is a single `t.date :date_of_birth`.

## `:address` — `mailing_address` and `employer_address`

Two address attributes are declared. An address expands into street/city/state/zip columns, e.g.:

```ruby
# contact (mailing_address is a strata :address attribute)
t.string :mailing_address_street_line_1
t.string :mailing_address_street_line_2
t.string :mailing_address_city
t.string :mailing_address_state
t.string :mailing_address_zip_code
```

The `employer_address` expands the same way (`employer_address_street_line_1`, … `_zip_code`). The
forms render both with `f.address_fields :mailing_address` / `f.address_fields :employer_address`.

## `:tax_id` — `claimant_ssn`

The claimant's SSN is a tax-id attribute (`strata_attribute :claimant_ssn, :tax_id`), stored as a
single `t.string :claimant_ssn` column and rendered with the `f.tax_id_field :claimant_ssn` form
helper.

> Note: not every field is a typed Strata attribute. Many fields (e.g. `email`, `phone_primary`,
> the boolean screener questions, `gender`, `payment_method`) are plain Active Record columns
> validated and rendered without a `strata_attribute` declaration.
</content>
