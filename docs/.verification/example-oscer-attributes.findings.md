# Verification findings: example-oscer-attributes (round 1)

Doc: docs/sources/oscer/attributes.md
Source: .sources/oscer (c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750)

No findings. Every claim in the doc is supported by the source.

Verified:
- `strata_attribute` DSL via `include Strata::Attributes` across AR models, value objects, and ActiveModel forms (activity.rb:22-24, information_request.rb:8-11, member.rb:8-10, base_create_form.rb).
- `array: true` / `range: true` modifiers (activity_report_application_form.rb:14,16; external_income_activity.rb:29).
- Array: `reporting_periods`/`months_that_can_be_certified` as `:year_month, array: true`; `MemberStatus` `reason_codes`/`human_readable_reason_codes` as `:string, array: true` (member_status.rb:55-56).
- Money: `strata_attribute :income, :money`, `Strata::Money.new(cents: 0)` validation, and `income&.cents` edit detection in `update_with_doc_ai_review` (income_activity.rb:7,13,17,24-26).
- Year-month: `Strata::YearMonth.new(month).strftime("%B %Y")` and `reporting_period_dates` sort/map over `.year`/`.month` into `Date`s (activity_report_application_form.rb).
- US date + range: `strata_attribute :period, :us_date, range: true` in external_income_activity.rb:29 and external_hourly_activity.rb:31; standalone `:us_date` for date_of_birth/certification_date (base_create_form.rb).
- `Strata::USDate.cast(value)` (batch_upload_record_validator.rb:107); `Strata::DateRange.new` (certifications/requirements.rb:54,58).
- Name: `:name` type (member.rb:10, base_create_form.rb), decomposed sub-field validations (member_name_first/last/middle/suffix), and `attribute :name, ActiveModel::Type::Json.new(Strata::Name)` (certifications/member_data.rb:71).
