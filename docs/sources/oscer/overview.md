---
id: example-oscer-overview
title: OSCER — overview
source: oscer
doc_type: guide
tags: [example-app, oscer, rails, medicaid, community-engagement, overview]
related:
  - example-oscer-business-process
  - example-oscer-tasks
  - example-oscer-application-forms
  - example-oscer-determinations
  - example-oscer-rules-engine
  - example-oscer-attributes
  - example-oscer-value-objects
  - example-oscer-authorization
  - example-oscer-api-authentication
  - example-oscer-audit-log-and-actors
integrates_with: [template-application-rails]
summary: A Rails application that implements a Medicaid community-engagement certification workflow on top of the Strata SDK, exercising business processes, cases, tasks, application forms, determinations, the rules engine, audit logging, and HMAC API auth.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/oscer_task.rb
    - reporting-app/app/models/activity_report_application_form.rb
    - reporting-app/app/models/determination.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — overview

OSCER is a Rails application (the `reporting-app/`) that implements a Medicaid
**community-engagement (CE) certification** workflow on top of the Strata SDK. A member is
required to demonstrate community engagement (work/volunteer hours or income) for a certification
period; the app determines whether they are exempt, automatically checks externally-sourced hours
and income, and — when that is insufficient — routes the member through self-reported activity
reporting with staff review.

Unlike the simpler `strata-unemployment` reference app, OSCER exercises nearly the entire SDK
surface: a multi-step `Strata::BusinessProcess`, a `Strata::Case` aggregate, applicant/staff/system
tasks, multiple `Strata::ApplicationForm` subclasses, `Strata::Determination` recording, the
`Strata::RulesEngine`, audit logging via `Strata::AuditLog`, virtual actors, HMAC API
authentication, and several typed-attribute and value-object features.

## What the app demonstrates

| SDK feature | Where it shows up | Doc |
|---|---|---|
| Business process (state machine) | `app/business_processes/certification_business_process.rb` (`< Strata::BusinessProcess`) | [business process](./business-process.md) |
| Case aggregate | `app/models/certification_case.rb` (`< Strata::Case`) | [business process](./business-process.md) |
| Tasks (applicant / staff / system) | `app/models/oscer_task.rb` (`< Strata::Task`), task steps in the business process | [tasks](./tasks.md) |
| Application forms | `app/models/{activity_report,exemption,denial_response}_application_form.rb` (`< Strata::ApplicationForm`) | [application forms](./application-forms.md) |
| Determinations + `Determinable` | `app/models/determination.rb`, `app/models/concerns/determinable.rb` | [determinations](./determinations.md) |
| Rules engine | `app/models/rules/exemption_ruleset.rb`, `app/services/exemption_determination_service.rb` | [rules engine](./rules-engine.md) |
| Typed `strata_attribute` + attribute types | many models; money, year-month, us-date, name, range | [attributes](./attributes.md) |
| Value objects | `app/models/member.rb`, `app/models/member_status.rb` (`< Strata::ValueObject`) | [value objects](./value-objects.md) |
| Authorization policies | `app/policies/strata/task_policy.rb`, `app/policies/*_application_form_policy.rb` | [authorization](./authorization.md) |
| HMAC API authentication | `app/controllers/concerns/api_hmac_authentication.rb` | [API authentication](./api-authentication.md) |
| Audit log + virtual actors | `app/models/concerns/determinable.rb`, determination/CE services | [audit log and actors](./audit-log-and-actors.md) |

## End-to-end shape

A `Certification` is the aggregate root for a member's certification period; on create it publishes
`CertificationCreated` (`app/models/certification.rb`):

```ruby
class Certification < ApplicationRecord
  include Determinable
  # ...
  after_create_commit do
    Strata::EventManager.publish("CertificationCreated", { certification_id: id })
  end
end
```

That event `start`s the `CertificationBusinessProcess`, which creates a `CertificationCase` and
drives it through automated determination steps (external exemption check, external CE check) and
human task steps (report activities, staff review). Each terminal step records a
`Determination` against the `Certification` and publishes a domain event;
`NotificationsEventListener` (subscribed to those events) sends the member email.

## Provenance

The documented code lives under `reporting-app/app`. The SDK is consumed as a dependency and the
app's Rails structure follows the Nava Platform Rails application template, so OSCER composes with
`template-application-rails`. (Infrastructure, the API client, DocAI sidecar integration, and the
non-`reporting-app` directories are out of the documented scope.)

## Out of scope / not documented here

Within `reporting-app/app`, several subsystems are app-specific rather than SDK demonstrations and
are not documented as SDK examples: the DocAI document-extraction pipeline
(`adapters/doc_ai_adapter.rb`, `services/doc_ai_*`), the storage adapters
(`adapters/storage/*`), the Cognito/OIDC member and staff auth provisioning
(`adapters/auth/*`, `services/auth_service.rb`, `services/member_oidc_provisioner.rb`), the batch
CSV upload pipeline, and the Devise-based user authentication forms under `forms/users/`. These do
not consume `Strata::` SDK surface that maps to a feature key.
</content>
</invoke>
