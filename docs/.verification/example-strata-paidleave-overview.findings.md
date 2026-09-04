# Verification findings — example-strata-paidleave-overview (round 2)

Doc: `docs/sources/strata-paidleave/overview.md`
Source: `.sources/strata-paidleave` @ `954a71f395db52d539c5cc09a27feb9675e34cde` (matches frontmatter `source_ref.ref`)

## Round 1 Findings — All Addressed

All five low-severity findings from round 1 have been fixed in the updated document:

1. ✓ **Provenance table now complete**: Includes all four `.template-infra` files (`app-paidleave.yml`,
   `app-casemgmt.yml`, `app-rulesengine.yml`, `base.yml`) on line 122–124.
2. ✓ **Catala commit now cited**: Provenance table (line 124) now includes `926f8c9`.
3. ✓ **MFA routing now explained**: Lines 80–82 explicitly note the MFA-preference redirect precedes
   the role branch.
4. ✓ **Fourth applicant step now mentioned**: Lines 64–65 name the request-for-information applicant
   step as part of the process.
5. ✓ **Staff:: namespace controllers now listed**: Line 77 now credits staff with
   `Staff::PaymentsController`, `Staff::InformationRequestsController`, `Staff::EmployersController`.

## Verified as Accurate (Round 2)

Re-verified all key claims against current source:

- SDK pin: `paidleave/Gemfile:78` — `gem "strata", git: "https://github.com/navapbc/strata-sdk-rails.git", ref: "86b095d"` ✓
- Five ApplicationForm subclasses + five matching flows ✓
- Portal entry points and inheritance hierarchy ✓
- MFA routing logic in `ApplicationController#after_sign_in_path_for` ✓
- Business process step definitions and transitions ✓
- DeterminationRecorder shared by staff UI and API ✓
- Out-of-scope claims (audit-log, virtual-actor, SDK auth, SDK policies, SDK rules-engine, generators) ✓
- Template Copier metadata (all versions and commit hashes) ✓
- All file paths in `source_ref` section ✓
- Related document IDs in frontmatter ✓
- Determinable and Determination carry generated-template comments ✓

## Findings (Round 2)

**None.** Document is fully accurate and complete.
