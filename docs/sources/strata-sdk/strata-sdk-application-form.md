---
id: strata-sdk-application-form
title: Application forms
source: strata-sdk
doc_type: feature
tags: [strata-sdk, application-form, intake, value-object]
related:
  - strata-sdk-getting-started
  - strata-sdk-attributes
  - strata-sdk-business-process
  - strata-sdk-determination
  - strata-sdk-authorization
  - strata-sdk-generators
feature_keys:
  - application-form
  - value-object
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The abstract Strata::ApplicationForm base class for intake forms, plus the Strata::ValueObject base for immutable value types.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/application_form.rb
    - app/models/strata/value_object.rb
    - docs/intake-application-forms.md
verified: ok
last_documented: 2026-06-29
---

# Application forms

`Strata::ApplicationForm` (`app/models/strata/application_form.rb`) is the abstract base class for
intake forms. Subclass it instead of `ApplicationRecord`; the SDK uses "application form" rather
than "form"/"application" to avoid clashing with web-app and HTML-form terminology. Appeals and
periodic reporting can also be modeled as subclasses.

## Public surface

`Strata::ApplicationForm` is `abstract_class = true` and includes `Strata::Attributes` and
`Strata::Determinable`. It defines:

- `status` enum — `in_progress: 0` (default) and `submitted: 1`. The writer is `protected`.
- `user_id` (uuid) and `submitted_at` (datetime) attributes.
- `submit_application` — validates with the `:submit` context (`valid?(:submit)`), and on success
  sets `status` to `submitted`, sets `submitted_at` to `Time.current`, persists via `save!`
  (raising on a persistence failure), and publishes a `<ClassName>Submitted` event. Returns `false`
  if validation fails.
- `submit` model callbacks (`before_submit` / `after_submit`) via `define_model_callbacks :submit`.
- After create it publishes a `<ClassName>Created` event (consumed by the business process engine
  to start a case).
- **Submitted forms are immutable:** a `before_update` callback adds a base error
  ("Cannot modify a submitted application") and `throw :abort` once `status_was == "submitted"`.

## Minimal usage

```ruby
class PassportApplicationForm < Strata::ApplicationForm
  strata_attribute :name, :name
  strata_attribute :birth_date, :memorable_date
  strata_attribute :ssn, :tax_id
  strata_attribute :residential_address, :address
end

form = PassportApplicationForm.new
form.name = { first: "John", last: "Doe" }
form.save
form.submit_application   # => true; publishes PassportApplicationFormSubmitted
```

The base columns required in a migration are `status:integer`, `user_id:uuid`, and
`submitted_at:datetime` (see `base_attributes_for_generator`); the Strata generators add these
automatically.

## Value objects

`Strata::ValueObject` (`app/models/strata/value_object.rb`) is the base class for immutable,
attribute-bearing value types. It mixes in `ActiveModel::Model`, `ActiveModel::Attributes`,
`ActiveModel::AttributeAssignment`, `ActiveModel::Validations`, JSON serialization,
`Strata::Attributes`, and `Strata::Validations`.
It compares by value (`==` checks every attribute), and provides `blank?`, `present?`, and
`persisted?` (always `false`). The Strata attribute value types (`Strata::Address`, `Money`,
`Name`, `YearMonth`, `YearQuarter`, `ValueRange`, and the `VirtualActor::Instance`) subclass it.

## Gotchas

- `status` writer is not public (it is `protected`) — drive status transitions through
  `submit_application`, not direct assignment. `submitted_at` is set inside `submit_application`
  and should also not be set directly, but its writer is not explicitly protected.
- The created/submitted events use the **concrete subclass name** (e.g.
  `PassportApplicationFormCreated`), which is what business-process `start_on_application_form_created`
  and `transition` event names must match.
- The submit guard works via `throw :abort` in a `before_update` callback, so `update` returns
  `false` rather than raising — check the return value or use a bang method.
