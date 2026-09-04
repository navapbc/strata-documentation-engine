# Verification findings: example-strata-paidleave-determinations (round 2)

Doc: `docs/sources/strata-paidleave/determinations.md`
Source: `.sources/strata-paidleave` @ `954a71f395db52d539c5cc09a27feb9675e34cde`

Verdict: the doc is substantially accurate. The code examples match their source
files verbatim. Round 1's six findings remain unresolved in the doc. One additional
issue identified below.

## 1. Quoted comment refers to non-existent method `make_determination!` — low

Claim: the doc quotes the comment from `app/models/staff/determination_form.rb` at line
207: "from +ActiveRecord::RecordInvalid#record+ after +make_determination!+ fails."

Issue: the method `make_determination!` does not exist in the codebase. The actual
method called throughout is `record_determination!` (Strata::Determinable's writer).
The comment in the form is stale — it refers to a method name that never appears
in the control flow. The form's `apply_invalid_record` method (line 39-43) is
actually called after the controller invokes `.call` on a `DeterminationRecorder`,
which internally calls `record_determination!` at `determination_recorder.rb:58`.

The doc's own explanation at line 224 correctly identifies the method as
`record_determination!`, but the quoted comment propagates the stale name.

Fix: either correct the quoted comment to `record_determination!`, or note the
discrepancy (e.g., "The form's comment refers to `make_determination!`, though the
actual method is `record_determination!`").
