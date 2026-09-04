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
  - example-oscer-verification-data-sources
  - example-oscer-attributes
  - example-oscer-value-objects
  - example-oscer-authorization
  - example-oscer-api-authentication
  - example-oscer-audit-log-and-actors
  - example-oscer-components
integrates_with: [template-application-rails, documentai-api]
summary: A Rails application that implements a Medicaid community-engagement certification workflow on top of the Strata SDK, exercising business processes, cases, tasks, application forms, determinations, the rules engine, audit logging, HMAC API auth, and SDK view components.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/business_processes/certification_business_process.rb
    - reporting-app/app/models/certification_case.rb
    - reporting-app/app/models/certification.rb
    - reporting-app/app/models/oscer_task.rb
    - reporting-app/app/models/oscer_application_form.rb
    - reporting-app/app/models/activity_report_application_form.rb
    - reporting-app/app/models/determination.rb
    - reporting-app/app/services/notifications_event_listener.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — overview

OSCER is a Rails application (the `reporting-app/`) that implements a Medicaid
**community-engagement (CE) certification** workflow on top of the Strata SDK. A member is
required to demonstrate community engagement (work/volunteer hours or income) for a certification
period. The app first checks whether the member is **excluded** or **excepted** from the
requirement, then assesses the hours and income it already has in hand, then — as a trailing step —
calls **out** to external verification data sources; only when none of that resolves the case does it
route the member through self-reported activity reporting with staff review.

Unlike the simpler `strata-unemployment` reference app, OSCER exercises nearly the entire SDK
surface: a multi-step `Strata::BusinessProcess`, a `Strata::Case` aggregate, applicant and staff
tasks, multiple `Strata::ApplicationForm` subclasses, `Strata::Determination` recording, the
`Strata::RulesEngine`, audit logging via `Strata::AuditLog`, virtual actors, HMAC API
authentication, several typed-attribute and value-object features, and SDK view components.

## What the app demonstrates

| SDK feature | Where it shows up | Doc |
|---|---|---|
| Business process (state machine) | `app/business_processes/certification_business_process.rb` (`< Strata::BusinessProcess`) | [business process](./business-process.md) |
| Case aggregate | `app/models/certification_case.rb` (`< Strata::Case`) | [business process](./business-process.md) |
| Tasks (applicant / staff) | `app/models/oscer_task.rb` (`< Strata::Task`), task steps in the business process | [tasks](./tasks.md) |
| Application forms | `app/models/oscer_application_form.rb` (`< Strata::ApplicationForm`) and its three subclasses | [application forms](./application-forms.md) |
| Determinations + `Determinable` | `app/models/determination.rb`, `app/models/concerns/determinable.rb` | [determinations](./determinations.md) |
| Rules engine | `app/models/rules/exclusion_ruleset.rb`, `app/services/exclusion_determination_service.rb` | [rules engine](./rules-engine.md) |
| A `system_process` that calls external sources | `app/services/data_source_check_service.rb`, `app/services/verification/**` | [verification data sources](./verification-data-sources.md) |
| Typed `strata_attribute` + attribute types | many models; money, year-month, us-date, name, tax-id, range, array | [attributes](./attributes.md) |
| Value objects | `app/models/member.rb`, `app/models/member_status.rb`, `app/models/doc_ai_result.rb` (`< Strata::ValueObject`) | [value objects](./value-objects.md) |
| Authorization policies | `app/policies/strata/task_policy.rb`, `app/policies/*_application_form_policy.rb` | [authorization](./authorization.md) |
| HMAC API authentication | `app/controllers/concerns/api_hmac_authentication.rb` | [API authentication](./api-authentication.md) |
| Audit log + virtual actors | `app/models/concerns/determinable.rb`, determination/CE services | [audit log and actors](./audit-log-and-actors.md) |
| SDK view components | `app/components/**` (`< Strata::Cases::CaseRowComponent`, `< Strata::Tasks::TaskRowComponent`), `app/views/certification_cases/*` | [components](./components.md) |

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
drives it through **four** automated determination steps — an external exclusion check, an external
exception check, an external community-engagement check over data in hand, and a trailing
verification-data-source check that calls out — and, when needed, human task steps (report
activities, staff review). Each concluding step records a `Determination` against the
`Certification` and publishes a domain event. `NotificationsEventListener` subscribes to the
member-facing subset of those events and sends the member email; internal routing events such as
`DeterminedCommunityEngagementNotMet` intentionally have no subscription.

## Provenance

The documented code lives under `reporting-app/app`. The SDK is consumed as a dependency and the
app's Rails structure follows the Nava Platform Rails application template, so OSCER composes with
`template-application-rails`. It also composes with the `documentai-api` sidecar: `DocAiAdapter`
(`app/adapters/doc_ai_adapter.rb`) posts documents to the sidecar's `v1/documents` endpoint and
`DocAiResult` (a `Strata::ValueObject`) wraps the response envelope.

## Out of scope / not documented here

Within `reporting-app/app`, several subsystems are app-specific rather than SDK demonstrations and
are not documented as SDK examples: the DocAI document-extraction *pipeline* itself
(`services/doc_ai_*`, the confidence/staging services — though the `DocAiResult` value object is
covered under [value objects](./value-objects.md)), the storage adapters (`adapters/storage/*`),
the Cognito/OIDC member and staff auth provisioning (`adapters/auth/*`, `services/auth_service.rb`,
`services/member_oidc_provisioner.rb`), the batch CSV upload pipeline, the config registries
(`Exclusion`, `ExternalException`, `Exemption` and their loaders), and the Devise-based user
authentication forms under `forms/users/`. These do not consume `Strata::` SDK surface that maps to
a feature key.
