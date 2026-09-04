# Verification findings: example-strata-paidleave-business-process (round 2)

Doc: `docs/sources/strata-paidleave/business-process.md`
Source: `.sources/strata-paidleave` @ `954a71f395db52d539c5cc09a27feb9675e34cde`
Last verified: 2026-09-04

## Round 1 findings: All resolved ✓

| Finding | Status | Evidence |
|---------|--------|----------|
| determinable? comment truncation | FIXED | Doc now shows complete comment (lines 163-168) matching source verbatim |
| decision_complete dead code | FIXED | Doc explicitly notes assignment is "dangling, so it gates nothing today" (line 194-195) |
| Event count misstatement | FIXED | Doc correctly states "publishes three of the four itself" (line 121) |
| source_ref.paths incomplete | FIXED | leave_application.rb now included in paths (line 22) |
| Case-row snippet incomplete | FIXED | All three branches described (lines 199-204); method labeled "— #due_on" (line 185) |
| SDK attribution unhedged | FIXED | SDK claims now hedged: "that is an inference... so confirm it against..." (lines 152-154) |

## Round 2 verification

Verified against current source files: all code snippets match byte-for-byte; all claims about methods, transitions,
event publishing, and state-reading paths are accurate; gaps correctly identified; frontmatter accurate; all
round 1 findings have been properly addressed.

## Findings

None. The doc is fully supported by the source at the specified commit.
