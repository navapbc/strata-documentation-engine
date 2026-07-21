---
id: example-strata-unemployment-overview
title: Strata Unemployment Portal — overview
source: strata-unemployment
doc_type: guide
tags: [example-app, unemployment, rails, overview]
related:
  - example-strata-unemployment-application-form
  - example-strata-unemployment-flow
  - example-strata-unemployment-attributes
  - example-strata-unemployment-form-builder
  - example-strata-unemployment-components
integrates_with: [template-application-rails]
summary: A reference Rails application that implements an unemployment benefits intake flow on top of the Strata SDK for Rails.
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/models/unemployment_benefits_application_form.rb
    - unemployment/app/flows/unemployment_benefits_flow.rb
    - unemployment/app/controllers/unemployment_benefits_application_forms_controller.rb
    - unemployment/app/controllers/staff_controller.rb
    - unemployment/app/views/unemployment_benefits_application_forms/show.html.erb
verified: ok
last_documented: 2026-06-29
---

# Strata Unemployment Portal — overview

The Strata Unemployment Portal is a reference Rails application that implements an
unemployment-benefits intake flow on top of the [Strata SDK for Rails](https://github.com/navapbc/strata-sdk-rails).
It is intended to be forked and customized by a state's team. The Strata SDK is pulled in as a git
gem (`unemployment/Gemfile`):

```ruby
# Strata SDK — provides ApplicationForm, flows, attribute types, UI components
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git", branch: "main"
```

## What the app demonstrates

The intake experience is built entirely from SDK building blocks. The pieces, and the docs that
cover each, are:

| SDK feature | Where it shows up in the app | Doc |
|---|---|---|
| Application form model | `app/models/unemployment_benefits_application_form.rb` (`< Strata::ApplicationForm`) | [application form](./application-form.md) |
| Multi-page flow | `app/flows/unemployment_benefits_flow.rb` (`include Strata::Flows::ApplicationFormFlow`) | [flow](./flow.md) |
| Typed `strata_attribute` declarations | `app/models/unemployment_benefits_application_form.rb` | [attributes](./attributes.md) |
| Form-builder field helpers | `app/views/unemployment_benefits_application_forms/edit_*.html.erb` | [form builder](./form-builder.md) |
| Pre-built ViewComponents / templates | `app/views/unemployment_benefits_application_forms/{index,show}.html.erb` | [components](./components.md) |

## Request path

A single Active Record model carries every field of the application. The controller mixes in the
SDK's flow controller and declares the flow:

```ruby
# app/controllers/unemployment_benefits_application_forms_controller.rb
class UnemploymentBenefitsApplicationFormsController < ApplicationController
  include Strata::Flows::ApplicationFormController
  # ...
  flow UnemploymentBenefitsFlow
```

Routes for each flow page are generated dynamically from the flow definition in
`config/routes.rb` (`UnemploymentBenefitsFlow.pages.each { |page| ... }`), the Strata engine is
mounted at `/` (`mount Strata::Engine => "/"`), and submission is driven by the SDK
(`@unemployment_benefits_application_form.submit_application` in the controller's `submit`
action; the `submitted?`, `status`, and `submitted_at` accessors used by the views are likewise
provided by the SDK base class).

## Staff side

The app subclasses the SDK staff controller for an internal view:

```ruby
# app/controllers/staff_controller.rb
class StaffController < Strata::StaffController
  before_action :authenticate_user!

  def case_classes
    []
  end
end
```

Note `case_classes` returns an empty array — this app does not register any Strata case classes,
so the staff dashboard has no case types to show.

## Provenance

The app's `app/` structure is generated from the Nava Platform Rails application template
(`.template-application-rails/unemployment.yml` records `_src_path:
https://github.com/navapbc/template-application-rails`), so it composes with
`template-application-rails`. Infrastructure lives under `infra/` (out of the documented
`unemployment/app` scope).

## Out of scope / not demonstrated

Within `unemployment/app`, the app does **not** use the SDK's determination, case, business-process,
audit-log, rules-engine, or virtual-actor features. Authentication is handled by the app's own
adapters under `app/adapters/auth/` and `app/services/auth_service.rb` (a Cognito/mock adapter
pair), not by the SDK's auth surface.
