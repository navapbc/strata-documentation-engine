---
id: example-strata-paidleave-overview
title: Strata Paid Leave — overview
source: strata-paidleave
doc_type: guide
tags: [example-app, paid-leave, rails, overview]
related:
  - example-strata-paidleave-business-process
  - example-strata-paidleave-cases-and-tasks
  - example-strata-paidleave-application-forms
  - example-strata-paidleave-flows
  - example-strata-paidleave-attributes
  - example-strata-paidleave-value-objects
  - example-strata-paidleave-determinations
  - example-strata-paidleave-form-builder
  - example-strata-paidleave-components
integrates_with:
  - template-application-rails
  - template-infra
  - template-application-nextjs
  - strata-template-rules-engine-catala
summary: A multi-portal Rails application — applicant, employer, and staff — built on the Strata SDK for Rails, exercising business processes, cases, tasks, five application-form flows, determinations, and the SDK's UI components.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/Gemfile
    - paidleave/app/business_processes/leave_application_business_process.rb
    - paidleave/app/models/leave_application.rb
    - paidleave/app/models/leave_application_case.rb
    - paidleave/app/controllers/staff_controller.rb
    - paidleave/app/controllers/staff/payments_controller.rb
    - paidleave/app/controllers/staff/information_requests_controller.rb
    - paidleave/app/controllers/staff/employers_controller.rb
    - paidleave/app/controllers/application_controller.rb
    - paidleave/app/services/case_management_service.rb
    - paidleave/config/routes.rb
    - docs/paidleave/README.md
    - docs/paidleave/api-access.md
    - docs/paidleave/software-architecture.md
    - docs/paidleave/technical-foundation.md
    - .template-application-rails/paidleave.yml
    - .template-infra/app-paidleave.yml
    - .template-infra/app-casemgmt.yml
    - .template-infra/app-rulesengine.yml
    - .template-infra/base.yml
    - .template-application-nextjs/casemgmt.yml
    - .strata-template-rules-engine-catala/rulesengine.yml
last_documented: 2026-09-04
verified: ok
---

# Strata Paid Leave — overview

Strata Paid Leave is a reference state paid-family-and-medical-leave application built on the
[Strata SDK for Rails](https://github.com/navapbc/strata-sdk-rails). The SDK is pinned as a git gem
at an exact commit (`paidleave/Gemfile`):

```ruby
# Strata Government Digital Services SDK Rails engine
gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git", ref: "86b095d"
```

Unlike a single-form reference app, this one uses most of the SDK's surface at once: it runs a
**business process** over a **case** with applicant, system, and staff **steps** (submit
application, employer review, staff review, and a follow-up applicant step for a staff-issued
request for information); it defines **five** separate `Strata::ApplicationForm` subclasses each
with its own **flow**; it records
**determinations** through a shared service that both a staff UI and a machine-to-machine API call;
and it renders the SDK's USWDS **components** and **form builder** throughout.

## Three portals in one Rails app

| Portal | Entry point | What it does |
|---|---|---|
| Applicant | `LeaveApplicationsController`, `ChangeRequestsController` | Apply for leave; request changes to an approved leave period |
| Employer | `Employers::ExemptionRequestsController`, `Employers::QuarterlyWageReportFormsController`, `Employers::ContributionPaymentFormsController`, `Employers::ReviewsController` | Request a program exemption; file quarterly wage reports; pay contributions; verify an employee's leave application |
| Staff | `StaffController < Strata::StaffController`, `LeaveApplicationCasesController`, `TasksController < Strata::TasksController`, `Staff::PaymentsController`, `Staff::InformationRequestsController`, `Staff::EmployersController` | Work the case queue, request information, record determinations, record payments |

Routing to the applicant/employer/staff landing page happens in
`ApplicationController#after_sign_in_path_for`. A user who has not yet chosen an MFA preference is
redirected to `users_mfa_preference_path` first; only after that does the method branch on the
user's role.

## What the app demonstrates

| SDK feature | Where it shows up | Doc |
|---|---|---|
| Business process with applicant / system / staff-task steps, plus a request-for-information applicant step | `app/business_processes/leave_application_business_process.rb` | [business process](./business-process.md) |
| `Strata::Case` and `Strata::Task` subclasses, staff dashboard | `app/models/leave_application_case.rb`, `app/models/staff_leave_review_task.rb` | [cases and tasks](./cases-and-tasks.md) |
| Five `Strata::ApplicationForm` subclasses | `app/models/{leave_application,change_request,exemption_request,quarterly_wage_report_form,contribution_payment_form}.rb` | [application forms](./application-forms.md) |
| Multi-page flows, branching, loops, route mounting | `app/models/flows/*.rb`, `config/routes.rb` | [flows](./flows.md) |
| `strata_attribute` typed attributes | `app/models/leave_application.rb`, `app/models/employee_wage_record.rb` | [attributes](./attributes.md) |
| `Strata::Money` / `Strata::YearQuarter` value objects | `app/models/concerns/{money_input,reporting_periods}.rb` | [value objects](./value-objects.md) |
| Determinations and `record_determination!` | `app/models/determination.rb`, `app/services/determination_recorder.rb` | [determinations](./determinations.md) |
| `strata_form_with` and the SDK field helpers | `app/views/leave_applications/edit_*.html.erb` | [form builder](./form-builder.md) |
| SDK ViewComponents (`Strata::US::*`, cases/tasks/flows components) | `app/views/**/*.html.erb`, `app/components/*.rb` | [components](./components.md) |

## The one path through the whole SDK

The leave application is the case that ties everything together:

1. Creating a `LeaveApplication` starts `LeaveApplicationBusinessProcess` on its first step
   (`start_on_application_form_created(SUBMIT_APPLICATION)`).
2. The applicant fills in `Flows::LeaveApplicationFlow` and `LeaveApplicationsController#submit`
   calls the SDK's `submit_application`.
3. Submission enqueues `EligibilityCheckJob` (calls the external rules engine) and
   `CreateLeaveApplicationCaseJob` (calls the external case management service).
4. The process advances off the applicant step to the employer-review system step, then the
   staff-review task, driven by published events.
5. Staff (or the case management service, over the API) record a determination through
   `DeterminationRecorder`, which publishes the event that transitions the process to its end step
   and closes the case.

## Provenance and composition

The repository is a Copier-composed monorepo. Each `.<template>/` directory records where a piece
came from:

| File | `_src_path` | Component |
|---|---|---|
| `.template-application-rails/paidleave.yml` | `navapbc/template-application-rails` (`v0.4.1`) | `template-application-rails` |
| `.template-infra/app-paidleave.yml`, `.template-infra/app-casemgmt.yml`, `.template-infra/app-rulesengine.yml`, `.template-infra/base.yml` | `navapbc/template-infra` (`v0.15.7`) | `template-infra` |
| `.template-application-nextjs/casemgmt.yml` | `navapbc/template-application-nextjs` (`v0.1.0`) | `template-application-nextjs` |
| `.strata-template-rules-engine-catala/rulesengine.yml` | `navapbc/strata-template-rules-engine-catala` (`926f8c9`) | `strata-template-rules-engine-catala` |

The Rails app under `paidleave/` composes with two of its sibling apps over HTTP, through adapters
in `app/adapters/` (the pattern is described in `docs/paidleave/software-architecture.md`):

- **`rulesengine`** (the Catala rules-engine template) — `RulesEngine::Adapter` /
  `RulesEngineService`, called from `EligibilityCheckJob` and `RulesEngineHealthCheckJob`. Note this
  is an **external service**, not the SDK's own `Strata::RulesEngine`; no code under
  `paidleave/app` references the SDK rules-engine class.
- **`casemgmt`** (the Next.js application template) — `CaseManagement::Adapter` /
  `CaseManagementService`, called from `CreateLeaveApplicationCaseJob`,
  `SyncCaseDocumentsJob`, `RecordPaymentsJob`, and friends. The reverse direction is a
  Doorkeeper-secured JSON API under `app/controllers/api/v1/` (see `docs/paidleave/api-access.md`).

## Out of scope / not demonstrated

Within `paidleave/app`, the app does **not** use:

- The SDK's `audit-log` or `virtual-actor` models — no reference to either appears in `app/`.
- The SDK's `auth` surface — authentication is Devise + Warden over a Cognito/mock adapter pair
  (`app/adapters/auth/`, `app/services/auth_service.rb`, `docs/paidleave/auth.md`), and the
  machine-to-machine API uses Doorkeeper OAuth client credentials
  (`app/controllers/api/v1/base_controller.rb`).
- The SDK's `policies` — authorization is plain Pundit with the app's own `ApplicationPolicy`
  hierarchy under `app/policies/`, not `Strata::ApplicationFormPolicy`.
- The SDK's `rules-engine` — see the composition note above.
- The SDK's `generators` — no generator invocation appears under `paidleave/app`; the app's
  `Determinable` and `Determination` files still carry generated-template documentation comments.

`Strata::EventManager.publish` is used in two places (`EmployerReview#publish_submission` and
`DeterminationRecorder#call`); it is app-private SDK surface rather than a cross-linked feature, so
it is documented inline in the [business process](./business-process.md) and
[determinations](./determinations.md) docs.
