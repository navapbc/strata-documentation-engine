---
id: example-oscer-application-forms
title: OSCER — application forms
source: oscer
doc_type: example
tags: [example-app, oscer, application-form, forms, validation]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-attributes
  - example-oscer-determinations
demonstrates: [application-form]
summary: How OSCER subclasses Strata::ApplicationForm for its three member-submitted forms and ties each to a staff review task.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/models/activity_report_application_form.rb
    - reporting-app/app/models/exemption_application_form.rb
    - reporting-app/app/models/denial_response_application_form.rb
    - reporting-app/app/models/concerns/form_approval_status.rb
verified: needs-review
last_documented: 2026-06-29
---

# OSCER — application forms

OSCER defines three member-submitted forms, each a subclass of `Strata::ApplicationForm`:
`ActivityReportApplicationForm`, `ExemptionApplicationForm`, and `DenialResponseApplicationForm`.
All three are submitted at the business process's `report_activities` step and route to a matching
staff review task.

## A representative form

`ActivityReportApplicationForm < Strata::ApplicationForm`
(`app/models/activity_report_application_form.rb`) is the richest example:

```ruby
class ActivityReportApplicationForm < Strata::ApplicationForm
  include FormApprovalStatus
  has_review_task "ReviewActivityReportTask"

  has_many :activities, strict_loading: true, autosave: true, dependent: :destroy
  default_scope { includes(:determinations, :activities) }

  strata_attribute :reporting_periods, :year_month, array: true
  strata_attribute :number_of_months_to_certify, :integer
  strata_attribute :months_that_can_be_certified, :year_month, array: true

  validates :certification_case_id, presence: true
  validate :case_not_closed, on: :create
  validate :no_pending_forms, on: :create
  # context-scoped validations on :reporting_period_selection ...
  accepts_nested_attributes_for :activities, allow_destroy: true
end
```

Things the SDK base class provides that the app relies on:

- **`determinations` association** — the form scopes `includes(:determinations)`, and the SDK exposes
  the `:status` enum (`in_progress`/etc.) that `flow_status` and `has_pending_form` query.
- **`event_payload`** — each form overrides it to merge `case_id: certification_case_id` so the
  submitted event routes to the case in the business process:

  ```ruby
  def event_payload
    super.merge(case_id: certification_case_id)
  end
  ```

- **Typed attributes** — declared with `strata_attribute` (see [attributes](./attributes.md)).
- **Immutability after submission** — forms expose their outcome through the review task rather than
  mutating themselves (see the `FormApprovalStatus` concern below).

## Submission gating

Each form adds the same create-time guards so a member can't submit against a closed case or stack
duplicate forms:

```ruby
def case_not_closed
  certification_case = CertificationCase.find_by(id: certification_case_id)
  if certification_case.blank?
    errors.add(:certification_case_id, "is invalid")
  elsif certification_case.closed?
    errors.add(:certification_case_id, "has closed")
  elsif certification_case.verification_window_ended?
    errors.add(:certification_case_id, "verification window has ended")
  end
end
```

`case_not_closed` reads case state (`closed?`, `verification_window_ended?`) from the
`CertificationCase` (a `Strata::Case`, see [business process](./business-process.md)).
`no_pending_forms` rejects a new submission while an in-progress form or an undecided review task
(`on_hold`/`pending`) exists for the case.

## The other two forms

- `ExemptionApplicationForm` — an `exemption_type` enum attribute (`enum :exemption_type,
  Exemption.enum_hash`), validated for inclusion in `Exemption.types + LEGACY_EXEMPTION_TYPES`
  with `allow_nil: true`, `has_many_attached :supporting_documents`, and
  `has_review_task "ReviewExemptionClaimTask"`.
- `DenialResponseApplicationForm` — a free-text `comment`, attached supporting documents, and
  `has_review_task "ReviewDenialResponseTask"`. It lets a member contest a denied case while the
  verification window is still open.

## Form approval status concern

`FormApprovalStatus` (`app/models/concerns/form_approval_status.rb`) is shared by all three forms.
It declares the `has_review_task` macro (a `has_one :review_task` to the bound task subclass) and
delegates the form's outcome to that task without mutating the (immutable) form:

```ruby
module FormApprovalStatus
  extend ActiveSupport::Concern
  class_methods do
    def has_review_task(class_name)
      has_one :review_task, class_name:, foreign_key: :application_form_id,
        inverse_of: :application_form, strict_loading: false
    end
  end

  def approval_status = review_task&.approval_status
  def approved? = review_task&.approved?
  def denied? = review_task&.denied?
end
```

`approval_status`/`approved?`/`denied?` delegate straight to the review task, so a form whose task is
still undecided reports `nil` (distinguishable from `approved`/`denied`) — letting helpers read the
form's outcome without mutating it.

Separately, `flow_status` decides between the form's own status and the case-level approval status by
checking whether the review task's `status` is `:completed` (via a `ReviewActivityReportTask...status:
:completed` `.exists?` query) — not by inspecting the `nil`/`approved`/`denied` value above. When the
task is complete it returns the case's approval status (`CertificationCase#activity_report_approval_status`);
otherwise it returns the form's own `status`.
</content>
