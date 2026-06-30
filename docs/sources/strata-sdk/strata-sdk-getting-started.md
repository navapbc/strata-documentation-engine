---
id: strata-sdk-getting-started
title: Getting started with the Strata SDK
source: strata-sdk
doc_type: guide
tags: [strata-sdk, getting-started, installation, rails-engine]
related:
  - strata-sdk-application-form
  - strata-sdk-attributes
  - strata-sdk-business-process
  - strata-sdk-generators
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: How to install the Strata SDK Rails engine into a host app and where to go next.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - docs/getting-started.md
    - docs/installation.md
    - docs/README.md
    - docs/api-authentication.md
    - docs/strata-audit-log.md
    - strata.gemspec
    - lib/strata/engine.rb
verified: ok
last_documented: 2026-06-29
---

# Getting started with the Strata SDK

The Strata SDK is a **Rails engine** (gem name `strata`) that provides building blocks for
government digital services: form attributes, multi-page form flows, a rules engine, case
management, intake application forms, authorization, i18n, audit logging, API authentication,
and generators. The engine's code lives in `app/`, `config/`, and `lib/` at the repo root.

## What the SDK provides

- **Base classes** — subclass `Strata::ApplicationForm`, `Strata::Case`, and `Strata::Task`
  instead of building from scratch.
- **Strata attributes** — declarative typed fields like `:address`, `:name`, `:money`, `:tax_id`,
  and date types, with validation and formatting built in.
- **Multi-page form flows** — a DSL for defining forms that span multiple pages, with
  auto-generated routes and controller actions.
- **Business process engine, task management, rules engine, UI components, generators,
  authorization, i18n, audit logging, and API authentication.**

## Prerequisites

The SDK is designed to be consumed by an app built from the
[Rails application template](https://github.com/navapbc/template-application-rails).

## Installation

Add the engine to your `Gemfile`:

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git"
```

Then run `bundle install`.

### JavaScript assets

The engine auto-configures JavaScript assets based on your asset pipeline:

- **Importmap (recommended):** the engine automatically registers its importmap pins by sweeping
  its own `config/importmap.rb` into your app's importmap at boot (the same pattern used by
  `turbo-rails` and `stimulus-rails`). No manual pin configuration is needed.
- **Sprockets / Propshaft:** the engine automatically adds its component directory to the asset
  load path and precompiles all Strata JS files.

### Stimulus controllers

Some components (such as conditional fields) use Stimulus controllers. Register them all at once
with the engine's `registerControllers` helper:

```js
import { Application } from "@hotwired/stimulus"
import { registerControllers } from "strata"

const application = Application.start()
registerControllers(application)
```

The import path is `"strata"` — the engine's importmap pins it to the correct JS entry point.

## Your first steps

When building a government digital service the typical first step is an application form for the
intake process. From there you define how the application is processed via a case management
business process.

1. [Create an application form](./strata-sdk-application-form.md)
2. [Add Strata attributes to your form](./strata-sdk-attributes.md)
3. [Render the form with the Form Builder or Multi-page Form Flows](./strata-sdk-form-builder.md)
4. [Define a case management business process](./strata-sdk-business-process.md)

## Where the SDK's own docs live

The engine ships extensive docs under its repo `docs/` directory, indexed by
[`docs/README.md`](https://github.com/navapbc/strata-sdk-rails/blob/main/docs/README.md). The docs
under this `docs/sources/strata-sdk/` tree distill and index those.
