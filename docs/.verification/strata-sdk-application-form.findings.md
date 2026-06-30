# Verification findings: strata-sdk-application-form

- Doc: `docs/sources/strata-sdk/strata-sdk-application-form.md`
- Source checkout: `.sources/strata-sdk`
- Round: 2

## Summary

All claims are supported by the source. The doc has been corrected and is now fully accurate.

## Previously identified issue (now fixed)

### Finding 1 — `submitted_at` writer protection (FIXED)

**Original issue (Round 1):** The doc previously claimed "`status` and `submitted_at` writers are not public", but only `status` is explicitly protected.

**Fix applied:** Doc now correctly states: "`status` writer is not public (it is `protected`) — drive status transitions through `submit_application`, not direct assignment. `submitted_at` is set inside `submit_application` and should also not be set directly, but its writer is not explicitly protected."

**Verification:** The fix accurately reflects source code at `application_form.rb:30` (protected status writer) and `application_form.rb:34` (unprotected submitted_at attribute).

## All claims verified as accurate

- `abstract_class = true`; includes `Strata::Attributes` and `Strata::Determinable`
  (`application_form.rb:22-25`).
- `status` enum `in_progress: 0` (default) / `submitted: 1`, with a `protected` writer
  (`application_form.rb:29-31`).
- `user_id` (uuid) and `submitted_at` (datetime) attributes (`application_form.rb:33-34`).
- `submit_application`: validates with `:submit` context, returns `false` on failure; on success
  sets `status` to submitted, sets `submitted_at` to `Time.current`, calls `save!`, then publishes
  `<ClassName>Submitted` (`application_form.rb:64-77`).
- `define_model_callbacks :submit, only: [:before, :after]` providing before/after submit
  callbacks (`application_form.rb:27`).
- `after_create :publish_created` publishing `<ClassName>Created` (`application_form.rb:51, 101-104`).
- Submitted-form immutability via `before_update :prevent_changes_if_submitted` gated on
  `was_submitted?` (which checks `status_was == "submitted"`); adds `:base` error and `throw :abort`
  (`application_form.rb:52, 92-98`).
- `base_attributes_for_generator` returns `user_id:uuid`, `status:integer`, `submitted_at:datetime`
  (`application_form.rb:42-48`).
- ValueObject module mix-ins (`ActiveModel::Model`, `ActiveModel::Attributes`,
  `ActiveModel::AttributeAssignment`, `ActiveModel::Validations`, `ActiveModel::Serializers::JSON`,
  `Strata::Attributes`, `Strata::Validations`), value-equality `==`, `blank?`, `present?`,
  `persisted? => false` (`value_object.rb:20-47`).
- All enumerated ValueObject subclasses confirmed: `Strata::Address`, `Money`, `Name`, `YearMonth`,
  `YearQuarter`, `ValueRange`, `VirtualActor::Instance`. `TaxId` (< String) and `USDate` (< Date)
  are correctly omitted.
- Appeals and periodic reporting as ApplicationForm subclasses supported by
  `docs/intake-application-forms.md:9-16`.
