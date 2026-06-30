# Verification findings: example-oscer-attributes (round 1)

Doc: docs/sources/oscer/attributes.md
Source: .sources/oscer (a4fc94b35ed737d20ca4530efe20d579ce5f0d53)

No findings. Every claim in the doc is supported by the source.

Verified:
- `strata_attribute` DSL via `include Strata::Attributes` across AR models, value objects, and ActiveModel forms (activity.rb, information_request.rb, member.rb, base_create_form.rb).
- `array: true` / `range: true` modifiers (activity_report_application_form.rb; external_income_activity.rb).
- Money: `strata_attribute :income, :money`, `Strata::Money.new(cents: 0)` validation, and `income&.cents` edit detection in `update_with_doc_ai_review` (income_activity.rb).
- Year-month: `Strata::YearMonth.new(month).strftime("%B %Y")` and `reporting_period_dates` sort/map over `.year`/`.month` into `Date`s (activity_report_application_form.rb:112, 60-65).
- US date + range: `strata_attribute :period, :us_date, range: true` in external_income_activity.rb and external_hourly_activity.rb; standalone `:us_date` for date_of_birth/certification_date (base_create_form.rb).
- `Strata::USDate.cast(value)` (batch_upload_record_validator.rb:107); `Strata::DateRange.new` (certifications/requirements.rb:54,58).
- Name: `:name` type (member.rb, base_create_form.rb), decomposed sub-field validations (member_name_first/last/middle/suffix), and `attribute :name, ActiveModel::Type::Json.new(Strata::Name)` (certifications/member_data.rb:71).
