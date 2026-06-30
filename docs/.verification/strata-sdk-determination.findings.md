# Verification findings: strata-sdk-determination (rounds 1–2)

Doc: `docs/sources/strata-sdk/strata-sdk-determination.md`
Source: `.sources/strata-sdk`

## Round 2 Summary

**Status: FULLY VERIFIED**

The round 1 finding ("reasons tree" imprecision) has been fixed: the doc now correctly
states "`determination_data` is intended to hold the rules-engine output (e.g. the
rules-engine reasons array)" (line 56–57). This matches the actual flat array structure
returned by `Fact#reasons`.

All other claims remain fully supported by the source code:

- Table `strata_determinations`, `belongs_to :subject, polymorphic: true, optional: false`,
  and the presence validation on `decision_method`, `reasons`, `outcome`,
  `determination_data`, `determined_at` all match
  `app/models/strata/determination.rb:29,32,35`.
- The three decision methods (`:automated` with `determined_by_id: nil`, `:staff_review`,
  `:attestation`) match the class comment at `determination.rb:7-10`.
- All query scopes (subject, attribute, time-window, and ordering) match
  `determination.rb:40-76` verbatim, including `with_reason` building
  `reasons && ARRAY[?]::varchar[]` (`determination.rb:59`).
- `has_many :determinations, as: :subject, dependent: :destroy` and the
  `record_determination!(decision_method:, reasons:, outcome:, determination_data:,
  determined_at:, determined_by_id: nil)` signature (raising `ActiveRecord::RecordInvalid`
  via `create!`) match `app/models/concerns/strata/determinable.rb:27,45-53`.
- "Included by default in `Strata::ApplicationForm`" is confirmed at
  `app/models/strata/application_form.rb:25` (`include Strata::Determinable`).
- The Gotchas contrast with `Strata::Auditable` (no cascade-destroy) is confirmed at
  `app/models/concerns/strata/auditable.rb:7-9,21` (the `has_many :audit_lines` association
  has no `dependent:` option).
- The schema confirms `reasons` is a Postgres `varchar` array column
  (`spec/dummy/db/schema.rb:84`).

Note: the doc's code example uses `RulesEngine.new(ruleset)` (with a ruleset argument),
which is actually *more* correct than the source's own docstring example
(`RulesEngine.new` with no args), because `RulesEngine#initialize(rules)` requires the
argument (`app/models/strata/rules_engine.rb:19`). This is not a doc defect.

## Findings

None. The doc is fully supported by the source code.
