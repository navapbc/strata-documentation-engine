# Verification findings: example-strata-unemployment-form-builder (round 2)

Doc: `docs/sources/strata-unemployment/form-builder.md`
Source: `.sources/strata-unemployment` @ 480303cf99722ff87c97e325e34316300b1bbd26

## Finding 1 (medium)

- **Claim**: Document references and exemplifies form-builder patterns found in view files `edit_citizenship`, `edit_wages`, `edit_education`, `edit_occupation`, `edit_tax_and_payment`, and `edit_prior_claims`.
- **Issue**: None of these six files are listed in the document's frontmatter `source_ref.paths` (lines 16-22). The frontmatter declares only six paths: edit_identity, edit_contact, edit_demographics, edit_claim_dependents, edit_most_recent_employer, edit_benefits. Including examples from undeclared source files violates the contract that all referenced files must be declared in the frontmatter's paths array. This creates ambiguity about the document's scope.
- **Evidence**: 
  - Frontmatter `source_ref.paths` includes only 6 files (lines 16-22)
  - Document mentions `edit_citizenship` (line 61), `edit_wages` (line 61), `edit_education` (lines 63-64), `edit_occupation` (line 68), `edit_tax_and_payment` (line 64), `edit_prior_claims` (line 92)
  - All six files exist in the source but are not in the declared paths
- **Severity**: medium
- **Suggested fix**: Add all six undeclared files to `source_ref.paths` in the frontmatter. This will make the document scope explicit and satisfy the contract. The files to add are:
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_citizenship.html.erb`
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_wages.html.erb`
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_education.html.erb`
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_occupation.html.erb`
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_tax_and_payment.html.erb`
  - `unemployment/app/views/unemployment_benefits_application_forms/edit_prior_claims.html.erb`

## Notes (verified accurate, no findings)

- Round 1 finding about `:attending_school` has been fixed — document now correctly shows `:receiving_social_security` example with `edit_benefits`.
- `strata_form_with` opener with `url: @flow_task.update_path, method: :patch` (line 27-29) — confirmed in all declared edit_*.erb files.
- `new.html.erb` uses `strata_form_with(model: ...)` with no URL (lines 42-43) — confirmed.
- Typed-attribute helpers `f.name`, `f.memorable_date`, `f.address_fields`, `f.tax_id_field` (lines 47-54) — confirmed in declared source files.
- `f.yes_no :receiving_social_security` in edit_benefits (line 60) — confirmed.
- `f.fieldset` usage (line 62-64) — confirmed in edit_demographics, edit_education, edit_most_recent_employer, edit_tax_and_payment (some undeclared).
- `f.select :number_of_dependent_children` in edit_claim_dependents (lines 65-66) — confirmed; edit_demographics uses different field (`language_preference`).
- `f.date_picker` in edit_most_recent_employer, edit_occupation, edit_claim_dependents (lines 67-68) — confirmed.
- `f.conditional` nesting in edit_claim_dependents (lines 80-88) — confirmed verbatim.
- Conditional gates for `branch_of_service`/`is_veteran`, `return_date`/`has_return_date`, `prior_claim_state`/`filed_claim_other_state` (lines 91-92) — all confirmed in respective edit_*.erb files.
