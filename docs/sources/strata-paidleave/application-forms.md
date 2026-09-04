---
id: example-strata-paidleave-application-forms
title: Five Strata::ApplicationForm subclasses
source: strata-paidleave
doc_type: example
tags: [example-app, application-form, model, validations, status]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-flows
  - example-strata-paidleave-attributes
  - example-strata-paidleave-value-objects
demonstrates:
  - application-form
summary: How the paid leave app models five different intakes as Strata::ApplicationForm subclasses, using page-scoped validation contexts, before_submit hooks, and — in one case — an extended status enum with its own review transitions.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/Gemfile
    - paidleave/app/models/leave_application.rb
    - paidleave/app/models/flows/leave_application_flow.rb
    - paidleave/app/models/change_request.rb
    - paidleave/app/models/exemption_request.rb
    - paidleave/app/models/quarterly_wage_report_form.rb
    - paidleave/app/models/contribution_payment_form.rb
    - paidleave/app/models/leave_application_employment_details.rb
    - paidleave/app/models/employee_wage_record.rb
    - paidleave/app/models/leave_period.rb
    - paidleave/app/controllers/leave_applications_controller.rb
    - paidleave/app/controllers/employers/quarterly_wage_report_forms_controller.rb
last_documented: 2026-09-04
verified: ok
---

# Five Strata::ApplicationForm subclasses

Most SDK example apps have one application form. This app has five, one per intake, and each pairs
with its own flow:

| Model | Flow | Who fills it |
|---|---|---|
| `LeaveApplication` | `Flows::LeaveApplicationFlow` | Applicant — the main leave intake: 15 question pages across four tasks, plus an info page and a review end page |
| `ChangeRequest` | `Flows::ChangeRequestFlow` | Applicant — modify or cancel an approved leave period |
| `ExemptionRequest` | `Flows::ExemptionRequestFlow` | Employer — request exemption from the program |
| `QuarterlyWageReportForm` | `Flows::QuarterlyWageReportFlow` | Employer — file quarterly wages |
| `ContributionPaymentForm` | `Flows::ContributionPaymentFlow` | Employer — pay contributions |

All five subclass `Strata::ApplicationForm`, mix in `Strata::Flows::ApplicationFormValidations`
(alongside the app's own `PresentsErrors`), and call `validate_flow` with their own flow:

```ruby
# app/models/leave_application.rb
class LeaveApplication < Strata::ApplicationForm
  include Strata::Flows::ApplicationFormValidations
  include PresentsErrors

  validate_flow Flows::LeaveApplicationFlow
```

The details differ per model: `ExemptionRequest` opts out of the default submit validation
(`validate_flow Flows::ExemptionRequestFlow, validate_on_submit: false`) and also includes
`Strata::Attributes`, while the two employer forms call `validate_flow` before pulling in further
concerns (`ReportingPeriods`, and `MoneyInput` on the payment form). All five are submitted through the SDK's `submit_application` from their controller's `submit`
action.

## Page-scoped validation contexts

`validate_flow` binds the model's validation contexts to its flow's page names, exposed as a `Flow`
constant namespace on the model. Validations then use Rails' `on:` contexts:

```ruby
# app/models/leave_application.rb
validates :applicant_name_first, presence: true, on: Flow::NAME
validates :applicant_name_last, presence: true, on: Flow::NAME

validates :residential_address_street_line_1, presence: true, on: Flow::ADDRESSES
# ...
validates :leave_period, presence: true, on: [ Flow::LEAVE_TYPE, Flow::LEAVE_DATES ]
validates :supporting_documents, length: { minimum: 1, message: :at_least_one },
  on: Flow::SUPPORTING_DOCUMENTS, unless: -> { leave_period&.leave_type_bonding? }
```

`ExemptionRequest` uses `with_options` to group one block of shared plan fields registered against
both plan-detail pages:

```ruby
# app/models/exemption_request.rb
with_options on: [ Flow::COMMERCIAL_PLAN_DETAILS, Flow::SELF_INSURED_PLAN_DETAILS ] do
  validates :plan_effective_date, presence: true
  validates :plan_expiration_date, presence: true
  validates :plan_name, presence: true
end
```

The contexts are also inherited by **child** records that mix in the same concern, so a nested
association can validate against the parent form's flow pages:

```ruby
# app/models/leave_application_employment_details.rb
class LeaveApplicationEmploymentDetails < ApplicationRecord
  include Strata::Flows::ApplicationFormValidations
  include Strata::Attributes

  validate_flow Flows::LeaveApplicationFlow

  validates :is_current_employer, inclusion: { in: [ true, false ] }, on: Flow::SELECT_CURRENT_EMPLOYERS
```

`LeavePeriod` does the same thing without the concern, by naming the parent's constant directly
(`on: LeaveApplication::Flow::LEAVE_DATES`).

### The rule this app documents twice

Both employer-facing forms — `QuarterlyWageReportForm` and `ContributionPaymentForm` — carry the
same comment, which is the most useful operational note in the set:

```ruby
# app/models/contribution_payment_form.rb (and quarterly_wage_report_form.rb)
# Page completion is `record.valid?(:page_name)`, so every question_page needs
# at least one validation, and every conditional page needs a matching `if:`
# guard (Task#completed? checks ALL pages, not just needed? ones).
```

That is why every conditional page's validations repeat the flow's branch condition as an `if:` —
e.g. `on: Flow::EMPLOYER_DETAILS, if: :manual_entry?`.

## `before_submit` hooks

Two forms mint their user-visible reference at submission time using the SDK's `before_submit`
callback:

```ruby
# app/models/quarterly_wage_report_form.rb
before_submit :assign_reference_number
# ...
def assign_reference_number
  return if reference_number.present?
  period = effective_reporting_period
  self.reference_number = "Q#{period.quarter}-#{period.year}-#{SecureRandom.alphanumeric(6).upcase}"
end
```

```ruby
# app/models/contribution_payment_form.rb
before_submit :assign_confirmation_details
# ...
self.confirmation_number ||= "PMT-#{SecureRandom.alphanumeric(8).upcase}"
```

(The payment form also sets `expected_settlement_date` to five days out. Its confirmation number and
settlement date are the parts explicitly marked as stubs for a real ACH gateway — "Set by the ACH
gateway, never by the user", with the 3-5 business day note in `assign_confirmation_details`. The
wage report's reference number carries no such note, only its format.)

## Extending the status enum

`Strata::ApplicationForm` provides two states, `in_progress: 0` and `submitted: 1`.
`ExemptionRequest` needs a reviewer workflow on top, and its comments record exactly what that costs:

```ruby
# app/models/exemption_request.rb
# Extends the two states provided by Strata::ApplicationForm (in_progress: 0,
# submitted: 1) with the reviewer-driven states. Answers are frozen from
# submission onward; see +prevent_changes_if_submitted+ below.
# The attribute is redeclared because redefining the enum in a subclass resets
# the base class's +attribute :status+ declaration.
attribute :status, :integer, default: 0
enum :status, {
  in_progress: 0, submitted: 1, under_review: 2,
  pending_info: 3, approved: 4, denied: 5
}
```

Three overrides follow from that, and each is worth copying if you extend the status enum yourself:

1. **Writes go through a private helper**, because the SDK keeps `status` behind a protected writer:

   ```ruby
   # Strata::ApplicationForm keeps +status+ behind a protected writer, so status
   # changes go through these methods rather than mass assignment.
   def begin_review!
     transition_to!(:under_review)
   end
   # ... request_information!, resume_review!, approve!, deny!

   def transition_to!(new_status)
     self[:status] = new_status
     save!
   end
   ```

2. **The submitted-record freeze is widened.** The base guard recognises only the `submitted`
   status, so a request under review would become editable again:

   ```ruby
   def prevent_changes_if_submitted
     return if (changed - [ "status", "updated_at" ]).empty?
     errors.add(:base, "Cannot modify a submitted application")
     throw :abort
   end

   def was_submitted?
     status_was.present? && status_was != "in_progress"
   end
   ```

   `updated_at` is excluded because Rails stamps it before the callback runs.

3. **Submit validation is taken over.** The flow has two mutually exclusive plan-detail branches, so
   validating every context would always fail:

   ```ruby
   validate_flow Flows::ExemptionRequestFlow, validate_on_submit: false
   # ...
   validate :required_pages_must_be_complete, on: :submit
   validate :fee_must_be_paid, on: :submit

   def required_contexts
     Flows::ExemptionRequestFlow.all_pages
       .select { |page| page.needed?(self) }
       .map { |page| page.name.to_sym }
   end
   ```

   `page.needed?(record)` is the SDK predicate for "does this page apply to this record" — the same
   one the flow uses to skip pages, reused here to build the submit-validation context list. The
   `all_pages` class method is what this app calls against the `strata-sdk-rails` ref it pins in its
   `Gemfile` (`86b095d`); the `strata-sdk` ref documented in this doc set exposes the flow's pages as
   `pages` instead, so check the SDK version you are on before copying the call verbatim.

## Non-column attributes on a form

`ContributionPaymentForm` is the clearest example of using plain `attribute` (not
`strata_attribute`, not a column) to keep sensitive input out of the database:

```ruby
# VIRTUAL attributes — declared with `attribute` and intentionally NOT backed
# by columns, so raw values never reach the database.
attribute :routing_number, :string
attribute :account_number, :string

# === Persisted results of tokenization ===
attribute :bank_account_token, :string
attribute :bank_account_last4, :string
```

Page completion is then checked against the **persisted** token rather than the virtual fields,
with the raw-entry rules scoped to "still collecting":

```ruby
validates :bank_account_token, presence: true,
          on: Flow::ACH_DEBIT_BANK_DETAILS, if: :ach_debit?

with_options on: Flow::ACH_DEBIT_BANK_DETAILS, if: :collecting_bank_details? do
  validates :routing_number, presence: true, format: { with: ROUTING_NUMBER_FORMAT }
  validates :account_number, presence: true, format: { with: ACCOUNT_NUMBER_FORMAT }
  validate  :routing_number_passes_aba_checksum
end

def collecting_bank_details?
  ach_debit? && bank_account_token.blank?
end
```

Its comment names the trap: validating the raw fields in the page context "would make the page read
as incomplete on every reload, because they are never stored."

## Nested children and autosave

`QuarterlyWageReportForm`'s manual-entry path is a repeater of `EmployeeWageRecord` rows, and the
association deliberately disables Rails' autosave validation:

```ruby
# `validate: false` is deliberate. Rails' autosave validation would surface
# child errors in EVERY validation context, and the SDK decides page
# completion with `record.valid?(:page_name)` — so one half-filled employee row
# would make unrelated pages (e.g. :period_and_method) read as incomplete.
has_many :employee_wage_records, ..., validate: false
accepts_nested_attributes_for :employee_wage_records, allow_destroy: true, reject_if: :all_blank
```

Child validity is instead surfaced in exactly one context:

```ruby
validate :employee_wage_records_within_limits,
         on: Flow::EMPLOYEE_WAGE_RECORDS, if: :manual_entry?
# ...
errors.add(:employee_wage_records, :invalid) if records.any?(&:invalid?)
```

This is the single most transferable lesson in this doc: **anything that leaks validation errors
into every context breaks SDK page-completion tracking.**

## Gaps worth knowing

- `ContributionPaymentForm` closes with a list of requirements it does *not* implement, including a
  real payment state machine, noting that "`Strata::ApplicationForm` only has
  `in_progress`/`submitted`" — the same limitation `ExemptionRequest` works around above.
- `EmployeeWageRecord`'s header explains why it is not built on the SDK's `Strata::IncomeRecord`
  factory: "that SDK factory fixes the schema at person_id / amount / period and cannot carry the
  six required payroll columns."
- `QuarterlyWageReportForm` and `ContributionPaymentForm` both scope to
  `where(user: user)` with a `TODO` — `User#managed_employers` is still a stub returning
  `Employer.all`, so employer-level scoping is not real yet.
