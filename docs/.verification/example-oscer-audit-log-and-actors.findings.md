# Verification findings — example-oscer-audit-log-and-actors (round 2)

Doc: `docs/sources/oscer/audit-log-and-actors.md`
Source: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257`

## Status

All round 1 findings have been addressed in the current doc:

1. **Subject claim (fixed)**: Doc now explicitly states "(never a `CertificationCase`)" on line 76, clarifying that subject is either `Certification` or created record.

2. **Exclusion service snippet (fixed)**: Doc now shows the complete three-way branch (if/elsif/else) with the elsif handling exceptions case at lines 96-101.

3. **`self` as actor (fixed)**: Doc now includes `class << self` block in the ExclusionDeterminationService example (line 93), making explicit that `self` is the class object.

4. **"consequential case actions" (fixed)**: Doc opening (line 32) now correctly says "consequential case actions" instead of "every consequential action", matching the source behavior.

## Round 2 verification

All major claims verified against current source:

- `Determinable#record_determination!` patterns and `determined_by_id` logic match source exactly
- `TasksController` audit logging with block form and `add_line` verified accurate
- All five virtual actor services confirmed to include `Strata::VirtualActor` and use `class << self`
- Method signature annotations for `actor: [Strata::VirtualActor]` verified in certification_case.rb
- ExternalIncomeActivityService correctly wraps `update!` and adds line with `actor: self` and action `external_income_activity.create`
- Claim about virtual-actor identity (class name only, no actor_id) supported by source patterns
- Events and notifications references verified
- Data source handling in determination_data verified

## Findings

None. Doc is fully supported by source.

