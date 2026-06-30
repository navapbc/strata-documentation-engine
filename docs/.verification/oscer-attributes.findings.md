# Verification findings: oscer-attributes (round 1)

Doc: `docs/sources/oscer/attributes.md`
Source: `.sources/oscer`

## Summary

Round 1 verification. The doc is fully supported by the source — no findings.

Every body claim and code snippet was checked against the source files listed in `source_ref.paths`:

- Intro: `strata_attribute` DSL comes from `Strata::Attributes`; used in AR models,
  `Strata::ValueObject`s, and plain form objects. Confirmed across all cited files.
- "Including the DSL" snippet: `class IncomeActivity < Activity`, `include Strata::Attributes`,
  `strata_attribute :income, :money` — exact match at `income_activity.rb:3-6`.
- Money section: `strata_attribute :income, :money` and the `income <= Strata::Money.new(cents: 0)`
  comparison in `income_must_be_greater_than_zero` — exact match at `income_activity.rb:6,26-30`.
- Name section: `Member` uses `strata_attribute :name, :name` (`member.rb:11`). The demo form
  uses `strata_attribute :member_name, :name` (`base_create_form.rb:23`), correctly labelled in
  the code snippet comment. Sub-field validations `member_name_first/_last/_middle/_suffix`
  confirmed at `base_create_form.rb:47-50`.
- US date section: `strata_attribute :date_of_birth, :us_date` and
  `strata_attribute :certification_date, :us_date` on a plain ActiveModel form
  (`base_create_form.rb:24,33`). The form includes `ActiveModel::Model` and `ActiveModel::Attributes`
  (`base_create_form.rb:6-7`), confirming "plain form object" characterisation.
- Year-month / array section: `strata_attribute :reporting_periods, :year_month, array: true`,
  `:number_of_months_to_certify, :integer`, `:months_that_can_be_certified, :year_month, array: true`
  — exact match at `activity_report_application_form.rb:14-16`. `reporting_period_dates` reads
  `.year`/`.month` (lines 62-64) and `Strata::YearMonth.new(month).strftime(...)` at line 112.
- Range section: comment `# DateRange provides built-in validation (start <= end)` and
  `strata_attribute :period, :us_date, range: true` — exact match at `external_hourly_activity.rb:29-30`.
  Same attribute on `external_income_activity.rb:26`.

## Findings

None. The doc is fully supported by the source.
