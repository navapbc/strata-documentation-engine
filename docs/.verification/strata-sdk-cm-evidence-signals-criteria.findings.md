# Verification findings: strata-sdk-cm-evidence-signals-criteria

- Round: 2
- Doc: `docs/sources/strata-sdk-case-management/strata-sdk-cm-evidence-signals-criteria.md`
- Source: `.sources/strata-sdk-case-management` @ `579d27695b7f5d655d8de020c65c256db3d05951`
- Verdict: all checks pass. Round 1 findings (6 total) have been properly addressed:
  - Finding 1 (unregistered evaluator throws before `try`): ✓ fixed — doc now clearly distinguishes pre-try errors from caught evaluator/validation errors
  - Finding 2 (event publishing order): ✓ fixed — doc now explicitly states evaluation events publish before persistence while evidence-attached/workflow events publish after
  - Finding 3 (blueprint statusProgression uniformity): ✓ fixed — doc now lists specific examples of varied progressions
  - Finding 4 (collectedAt default location and addWithSignals behavior): ✓ fixed — doc now attributes "defaults to now" to SignalInput and states addWithSignals always stamps store time
  - Finding 5 (validateCriterionDag scope): ✓ fixed — doc now mentions both reference validation and cycle detection, names ConfigurationError
  - Finding 6 (EvaluationResult source_ref.paths): ✓ fixed — `sdk/types/src/events.ts` now included in paths

No new findings in round 2. All data model definitions, operation sequences, evaluation rules, gotchas, and source references are accurate and complete.
