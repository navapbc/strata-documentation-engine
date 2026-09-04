---
id: example-strata-paidleave-determinations
title: Determinations (Strata::Determination, Strata::Determinable)
source: strata-paidleave
doc_type: example
tags: [example-app, determination, determinable, staff-review, api]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-business-process
  - example-strata-paidleave-cases-and-tasks
  - example-strata-paidleave-form-builder
demonstrates:
  - determination
  - concerns/determinable
summary: How the paid leave app subclasses Strata::Determination to attach a PDF decision letter and funnels every recording of a determination — staff UI and machine-to-machine API — through one service that calls record_determination! and publishes the case-closing event.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/models/determination.rb
    - paidleave/app/models/concerns/determinable.rb
    - paidleave/app/models/leave_application.rb
    - paidleave/app/services/determination_recorder.rb
    - paidleave/app/controllers/determinations_controller.rb
    - paidleave/app/controllers/api/v1/determinations_controller.rb
    - paidleave/app/controllers/api/v1/base_controller.rb
    - paidleave/app/models/staff/determination_form.rb
    - paidleave/app/serializers/leave_application_case_serializer.rb
last_documented: 2026-09-04
verified: ok
---

# Determinations

## The subclass

`Determination` subclasses `Strata::Determination` and adds exactly one thing — the decision letter:

```ruby
# app/models/determination.rb
class Determination < Strata::Determination
  # The official determination letter (a PDF) produced for this decision and
  # uploaded by the case management service via Active Storage Direct Uploads.
  # See Api::V1::DeterminationLettersController and Api::V1::DirectUploadsController.
  has_one_attached :letter

  # Only validated when a letter is attached (active_storage_validations skips
  # the check otherwise), so determinations recorded without a letter stay valid.
  validates :letter,
    content_type: { in: [ "application/pdf" ], message: "must be a PDF" },
    size: { less_than: 25.megabytes, message: "must be smaller than 25 MB" }
end
```

Everything else — the polymorphic `subject`, the `decision_method` / `reasons` / `outcome` /
`determination_data` / `determined_at` fields and their validations, and the `latest_first`,
`with_outcome`, `determined_between` scopes — comes from the base class. The file keeps the
generated documentation comments listing that surface, which is a useful inventory in its own right.

The app's most-used scope is `latest_first`:

```ruby
# app/models/leave_application.rb
def approved?
  determinations.latest_first.first&.outcome == "approved"
end

def denied?
  determinations.latest_first.first&.outcome == "denied"
end
```

## Pointing the association at the subclass

`Strata::Determinable` gives an aggregate root its `determinations` association, but that
association hardcodes the SDK class. Because this app needs its **own** subclass (the one carrying
the letter attachment), it re-declares the association:

```ruby
# app/models/leave_application.rb
# Override Strata::Determinable's association (which hardcodes
# class_name: "Strata::Determination") so determinations are instantiated as
# our Determination subclass — that's what carries the attached determination
# letter. There is no STI `type` column on strata_determinations, so every row
# simply loads as Determination.
has_many :determinations, as: :subject, class_name: "Determination", dependent: :destroy
```

This is the single most reusable finding in this doc: **subclassing `Strata::Determination` is not
enough; you must also override the `has_many` that `Determinable` installs**, and it is safe to do
so because the table has no STI discriminator.

Note that the app's `app/models/concerns/determinable.rb` is a generated wrapper:

```ruby
module Determinable
  extend ActiveSupport::Concern
  include Strata::Determinable

  # Add custom validations, callbacks, or scopes for determinations here
end
```

No model in `paidleave/app` includes it — `LeaveApplication` reaches `record_determination!` through
`Strata::ApplicationForm`, which the file's own comment says includes `Determinable` by default. The
concern is a customization seam left unused.

## One recorder, two entry points

Persisting a determination has three side effects that must happen in the same transaction, so it
lives in a service rather than a controller:

```ruby
# app/services/determination_recorder.rb
# Records a determination on a leave application and performs the side effects
# that must always accompany it:
#
#   1. Persist the +Determination+ on the application.
#   2. Complete the case's open staff review task.
#   3. Create a benefit year when the outcome is an approval.
#   4. Publish the determination event so the case's business process advances
#      to its end step (which closes the case).
#
# Step 4 is the reason this lives in a service rather than each controller: the
# event publish is what actually closes the case, so it must happen identically
# whether the determination is made through the staff UI
# (+DeterminationsController+) or the system-to-system API
# (+Api::V1::DeterminationsController+).
```

The whole of it is one transaction around the SDK call:

```ruby
def call
  leave_application_case = @leave_application.case
  review_task = leave_application_case.tasks.incomplete.with_type(StaffLeaveReviewTask.name).first

  determination = nil
  ActiveRecord::Base.transaction do
    determination = @leave_application.record_determination!(
      decision_method: @decision_method,
      reasons: @reasons,
      outcome: @outcome,
      determination_data: @determination_data,
      determined_at: @determined_at,
      determined_by_id: @determined_by_id
    )

    review_task&.update!(status: :completed)

    create_benefit_year_if_needed if @outcome == "approved"

    event_name = "#{LeaveApplication.name}#{@outcome.titlecase}"
    Rails.logger.debug "Publishing event #{event_name} for case with ID: #{leave_application_case.id}"
    Strata::EventManager.publish(event_name, { case_id: leave_application_case.id })
  end

  determination
end
```

`record_determination!` is `Strata::Determinable`'s writer. The recorder passes six keywords; the
app's `app/models/concerns/determinable.rb` comments show `determined_by_id` as optional — their
automated-determination example omits it and passes only five.

The outcome is constrained up front, so the derived event name always matches a declared transition:

```ruby
# Outcomes that map to a business process transition. Any other outcome would
# record a determination that never advances (or closes) the case.
OUTCOMES = %w[approved denied].freeze

# ... in #initialize, after assigning @outcome:
unless OUTCOMES.include?(@outcome)
  raise ArgumentError, "unsupported determination outcome: #{@outcome.inspect}"
end
```

The two entry points meet that raise differently: the API controller checks
`DeterminationRecorder::OUTCOMES` itself and returns an `invalid_outcome` 422 before constructing
the recorder, while the staff controller relies on its `rescue StandardError` clause, which turns the
`ArgumentError` into a base error on the form.

### Guard before you record

The recorder deliberately does **not** check eligibility to record — "Callers are responsible for
confirming the application is determinable (see `LeaveApplication#determinable?`) before invoking
the recorder." Both callers do:

```ruby
# app/models/leave_application.rb
def determinable?
  submitted? && self.case&.open? && determinations.none?
end
```

### Entry point 1: the staff UI

`DeterminationsController` (a subclass of the app's `StaffController`, so it renders inside the
staff dashboard) collects the decision through a plain ActiveModel form object, because the fields
do not map one-to-one onto the `Determination` record:

```ruby
# app/models/staff/determination_form.rb
module Staff
  # ActiveModel form for staff case determination UI. Used with +strata_form_with+ so
  # field-level errors render in the drawer; +#apply_invalid_record+ copies errors
  # from +ActiveRecord::RecordInvalid#record+ after +make_determination!+ fails.
  class DeterminationForm
    include ActiveModel::Model
    include ActiveModel::Attributes

    attribute :outcome, :string
    attribute :notes, :string

    def self.model_name
      ActiveModel::Name.new(self, nil, "Determination")
    end
```

Two details worth stealing: `model_name` is overridden to `"Determination"` *because* the class is
namespaced — `Staff::DeterminationForm` would otherwise generate `staff_determination[...]` field
names and `staff/determination` i18n keys, so the override makes `strata_form_with` produce the same
names and keys as the record would. And `apply_invalid_record` copies
validation errors off the record the SDK raised about, so a failed
`record_determination!` renders as field errors in the drawer:

```ruby
# app/controllers/determinations_controller.rb
@determination_form = Staff::DeterminationForm.new(determination_params)

authorize @leave_application, :create?, policy_class: DeterminationPolicy

DeterminationRecorder.new(
  leave_application: @leave_application,
  outcome: @determination_form.outcome,
  reasons: @determination_form.reasons,
  decision_method: "staff_review",
  determination_data: { notes: @determination_form.notes },
  determined_by_id: current_user.id
).call
# ...
rescue ActiveRecord::RecordInvalid => e
  @determination_form.apply_invalid_record(e.record)
  render_determination_form_errors
```

The staff path is the one that populates `determined_by_id` (from `current_user`) and re-renders
into a Turbo frame on failure — but only when the request came from the drawer's Turbo frame;
otherwise `render_determination_form_errors` redirects to the case page with an alert. The success
path branches the same way (`render "visit_redirect"` for a Turbo frame request, else a redirect with
a notice). Authorization here is explicit and per-record: `authorize @leave_application, :create?,
policy_class: DeterminationPolicy`, on top of `StaffController`'s staff session.

### Entry point 2: the machine-to-machine API

`Api::V1::DeterminationsController` runs the same recorder, called by the external case management
service over an OAuth client-credentials token. Its authorization gate is different: there is no
Pundit `authorize` call and no policy at all — the only check is `before_action :doorkeeper_authorize!`
inherited from `Api::V1::BaseController`, so holding a valid client-credentials token is sufficient.

```ruby
# app/controllers/api/v1/determinations_controller.rb
unless leave_application.determinable?
  return render json: { error: "not_determinable", ... }, status: :unprocessable_entity
end

outcome = determination_params[:outcome].to_s
unless DeterminationRecorder::OUTCOMES.include?(outcome)
  return render json: {
    error: "invalid_outcome",
    message: "outcome must be one of: #{DeterminationRecorder::OUTCOMES.join(', ')}"
  }, status: :unprocessable_entity
end

determination = DeterminationRecorder.new(
  leave_application: leave_application,
  outcome: outcome,
  reasons: determination_params[:reasons],
  decision_method: "staff_review",
  determination_data: {
    notes: determination_params[:notes],
    recorded_via: "api",
    client: current_client.name
  }.compact
).call
```

`determination_data` is the SDK's free-form JSON field, and the API path uses it as an audit trail:
`recorded_via: "api"` plus the calling client's name. There is no resource owner in the client
credentials flow, so `determined_by_id` is left unset here — the calling system is identified in
`determination_data` instead. It reuses `DeterminationRecorder::OUTCOMES` as its own request
validation, so the API and the service can never disagree about valid outcomes.

## Reading determinations back out

The case API serializes the full history, including the letter:

```ruby
# app/serializers/leave_application_case_serializer.rb
def determinations_json
  @application.determinations.latest_first.map do |determination|
    {
      outcome: determination.outcome,
      reasons: determination.reasons,
      decision_method: determination.decision_method,
      notes: determination.determination_data&.dig("notes"),
      determined_at: determination.determined_at&.iso8601,
      determined_by_id: determination.determined_by_id,
      letter: letter_json(determination)
    }
  end
end
```

`determination_data&.dig("notes")` is the read side of the write above — the field round-trips as a
hash with string keys.

## Gaps worth knowing

- `decision_method` is `"staff_review"` on both paths. The SDK also supports automated and attested
  determinations (per `Determination`'s own comments), and the app's `EligibilityCheck` /
  `RulesEngineService` results are *not* recorded as automated determinations — they are stored on
  their own `eligibility_checks` rows and merely surfaced in the case JSON.
- `Determination` adds no domain enums for `outcome` or `reasons`, so the `%w[approved denied]`
  constraint lives in `DeterminationRecorder` rather than the model. A determination created outside
  the recorder would not be constrained.
