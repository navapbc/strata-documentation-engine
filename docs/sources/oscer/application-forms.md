---
id: example-oscer-application-forms
title: OSCER — application forms
source: oscer
verified: ok
doc_type: example
tags: [example-app, oscer, application-form, forms, validation]
related:
  - example-oscer-overview
  - example-oscer-business-process
  - example-oscer-attributes
  - example-oscer-determinations
demonstrates: [application-form]
summary: How OSCER subclasses Strata::ApplicationForm through an abstract OscerApplicationForm base for its three member-submitted forms, each tied to a staff review task.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750"
  paths:
    - reporting-app/app/models/oscer_application_form.rb
    - reporting-app/app/models/activity_report_application_form.rb
    - reporting-app/app/models/exemption_application_form.rb
    - reporting-app/app/models/denial_response_application_form.rb
    - reporting-app/app/models/concerns/form_approval_status.rb
last_documented: 2026-07-21
---

# OSCER — application forms

OSCER defines three member-submitted forms — `ActivityReportApplicationForm`,
`ExemptionApplicationForm`, and `DenialResponseApplicationForm` — all descending from
`Strata::ApplicationForm` through a shared abstract base, `OscerApplicationForm`. All three are
submitted at the business process's `report_activities` step and route to a matching staff review
task.

## The abstract base

`OscerApplicationForm < Strata::ApplicationForm` (`app/models/oscer_application_form.rb`) is
`abstract_class = true` (not STI): `Strata::ApplicationForm` is itself abstract and each concrete
form has its own table (no `type` column). The base holds the case-bound lifecycle the three forms
share — creation guards, pending-form detection, flow status, and event routing:

```ruby
class OscerApplicationForm < Strata::ApplicationForm
  self.abstract_class = true
  include FormApprovalStatus

  # Declares which CertificationCase approval-status accessor flow_status reads once review completes
  def self.case_approval_status(accessor)
    self.case_approval_status_accessor_name = accessor
  end

  validates :certification_case_id, presence: true
  validate :case_not_closed, on: :create
  validate :no_pending_forms, on: :create

  # Route the Created/Submitted events to the case in the business process
  def event_payload
    super.merge(case_id: certification_case_id)
  end
end
```

Each concrete subclass then carries only its own fields plus two bindings — `has_review_task` (from
`FormApprovalStatus`) naming its review-task class, and `case_approval_status` naming the
`CertificationCase` accessor `flow_status` reads once staff review completes:

```ruby
class ActivityReportApplicationForm < OscerApplicationForm
  has_review_task "ReviewActivityReportTask"
  case_approval_status :activity_report_approval_status

  has_many :activities, strict_loading: true, autosave: true, dependent: :destroy
  default_scope { includes(:determinations, :activities) }

  strata_attribute :reporting_periods, :year_month, array: true
  strata_attribute :number_of_months_to_certify, :integer
  strata_attribute :months_that_can_be_certified, :year_month, array: true

  accepts_nested_attributes_for :activities, allow_destroy: true
end
```

Things the SDK base class provides that the app relies on:

- **`determinations` association** — the form scopes `includes(:determinations)` to eager-load the
  determinations the SDK associates with each form.
- **`:status` enum** — the form's own submit-status enum (`in_progress`/etc.) provided by the SDK
  base, which `has_pending_form` queries (`status: :in_progress`) and `flow_status` returns until the
  review task completes.
- **`event_payload`** — overridden on the base to merge `case_id: certification_case_id` so the
  submitted event routes to the case in the business process.
- **Typed attributes** — declared with `strata_attribute` (see [attributes](./attributes.md)).
- **Immutability after submission** — forms expose their outcome through the review task rather than
  mutating themselves (see the `FormApprovalStatus` concern below).

## Submission gating

The base adds create-time guards so a member can't submit against a closed case or stack
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
`no_pending_forms` (via `has_pending_form`) rejects a new submission while an in-progress form or an
undecided review task (`on_hold`/`pending`) exists for the case.

## The three forms

- `ActivityReportApplicationForm` (above) — the richest form: reporting-period attributes and a
  `has_many :activities`.
- `ExemptionApplicationForm` — an `exemption_type` enum attribute (`enum :exemption_type,
  Exemption.enum_hash`), validated for inclusion in `Exemption.types + LEGACY_EXEMPTION_TYPES`
  with `allow_nil: true`, `has_many_attached :supporting_documents`,
  `has_review_task "ReviewExemptionClaimTask"`, and `case_approval_status
  :exemption_request_approval_status`.
- `DenialResponseApplicationForm` — a free-text `strata_attribute :comment, :text`, attached
  supporting documents, `has_review_task "ReviewDenialResponseTask"`, and `case_approval_status
  :denial_response_approval_status`. It lets a member contest a denied case while the verification
  window is still open.

## Form approval status concern

`FormApprovalStatus` (`app/models/concerns/form_approval_status.rb`) is included by
`OscerApplicationForm`. It declares the `has_review_task` macro (recording the review-task class
name as a `class_attribute` and adding a `has_one :review_task`), resolves it lazily via
`review_task_class` (deferred to avoid a Zeitwerk load cycle, since a review task references its
form class), and delegates the form's outcome to that task without mutating the (immutable) form:

```ruby
module FormApprovalStatus
  extend ActiveSupport::Concern

  class_methods do
    def has_review_task(class_name)
      self.review_task_class_name = class_name
      has_one :review_task, class_name: class_name, foreign_key: :application_form_id,
        inverse_of: :application_form, strict_loading: false
    end

    def review_task_class
      review_task_class_name&.constantize or
        raise NotImplementedError, "#{name} must declare has_review_task"
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

Separately, the base's `flow_status` decides between the form's own status and the case-level
approval status by checking whether the review task's `status` is `:completed` (a `.exists?` query)
— not by inspecting the `nil`/`approved`/`denied` value above. When the task is complete it returns
the case's approval status (via the accessor named by `case_approval_status`); otherwise it returns
the form's own `status`.
