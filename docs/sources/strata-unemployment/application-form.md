---
id: example-strata-unemployment-application-form
title: Unemployment benefits application form (Strata::ApplicationForm)
source: strata-unemployment
doc_type: example
tags: [example-app, application-form, model, validations]
related:
  - example-strata-unemployment-overview
  - example-strata-unemployment-flow
  - example-strata-unemployment-attributes
demonstrates: [application-form]
summary: How the unemployment portal subclasses Strata::ApplicationForm with per-page (on:) validations to model a single multi-page application record.
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/models/unemployment_benefits_application_form.rb
    - unemployment/app/controllers/unemployment_benefits_application_forms_controller.rb
    - unemployment/db/migrate/20260319000000_create_unemployment_benefits_application_forms.rb
verified: ok
last_documented: 2026-06-29
---

# Unemployment benefits application form

`UnemploymentBenefitsApplicationForm` is the app's single application record. It subclasses the
SDK's `Strata::ApplicationForm` base and mixes in the flow-validation concern:

```ruby
# app/models/unemployment_benefits_application_form.rb
class UnemploymentBenefitsApplicationForm < Strata::ApplicationForm
  include Strata::Flows::ApplicationFormValidations
  validate_flow UnemploymentBenefitsFlow
  # ...
end
```

`validate_flow` ties the model's validations to the flow (see the [flow doc](./flow.md)).

## One record, page-scoped validations

Every field of the ~14-page application lives on this one model and its one table
(`create_unemployment_benefits_application_forms`). Validations are scoped to the page the user is
on using Rails' `on:` validation contexts, where each context is a flow page constant
(`Flow::IDENTITY`, `Flow::CONTACT`, etc.):

```ruby
# screener
validates :attending_school, inclusion: { in: [ true, false ] }, on: Flow::SCHOOL_AND_TRAINING
validates :receiving_social_security, inclusion: { in: [ true, false ] }, on: Flow::BENEFITS

# identity
validates :claimant_name_first, presence: true, on: Flow::IDENTITY
validates :claimant_name_last, presence: true, on: Flow::IDENTITY
validates :date_of_birth, presence: true, on: Flow::IDENTITY
validates :email, presence: true, on: Flow::IDENTITY

# contact
validates :mailing_address_street_line_1, presence: true, on: Flow::CONTACT
validates :phone_primary, presence: true, on: Flow::CONTACT
```

This is the SDK's pattern for splitting a long intake into pages without multiple records: the flow
controller validates only the current page's context as the claimant advances, while all fields
persist to the same row. Note that page validations reference the *expanded* attribute columns —
e.g. the `:name` attribute `claimant_name` is validated through `claimant_name_first` /
`claimant_name_last` (see [attributes](./attributes.md)).

## Persistence

The backing table declares a column per field. The migration comments show how Strata attribute
types map to columns — for example the `:name` attribute expands to `claimant_name_first`,
`claimant_name_middle`, `claimant_name_last`, and the `:address` attribute to
`mailing_address_street_line_1`, `..._city`, `..._state`, `..._zip_code`, etc.:

```ruby
# db/migrate/20260319000000_create_unemployment_benefits_application_forms.rb
t.integer :status
t.datetime :submitted_at
# identity (claimant_name is a strata :name attribute -> _first, _middle, _last)
t.string :claimant_name_first
t.string :claimant_name_middle
t.string :claimant_name_last
```

## Submission

Submission is delegated to the SDK base class. The controller calls `submit_application` and reads
SDK-provided state:

```ruby
# app/controllers/unemployment_benefits_application_forms_controller.rb
def submit
  if @unemployment_benefits_application_form.submit_application
    redirect_to unemployment_benefits_application_form_path(@unemployment_benefits_application_form)
  # ...
end
```

The `submit_application` method, along with the `submitted?`, `status`, and `submitted_at`
accessors used by the show/review/index views, comes from `Strata::ApplicationForm` — they are not
defined in the app.
