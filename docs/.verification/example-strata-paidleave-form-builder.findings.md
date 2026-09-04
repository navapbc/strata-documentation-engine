# Verification findings for example-strata-paidleave-form-builder

**Round 2**

## Summary

One finding: the doc's example table references two view files that are not listed in the source_ref paths, creating an unsupported claim under the "never silently drop" invariant.

## Finding

**Claim:** The table on line 100–108 lists example files for each form helper:
- `:us_date` → `f.date_picker` → examples: `edit_commercial_plan_details.html.erb`, **`staff/payments/new.html.erb`**
- `:tax_id` → `f.tax_id_field` → examples: `edit_tax_identifier.html.erb`, **`edit_employer_details.html.erb`**

**Issue:** Both `staff/payments/new.html.erb` (full path: `paidleave/app/views/staff/payments/new.html.erb`) and `edit_employer_details.html.erb` (full path: `paidleave/app/views/employers/quarterly_wage_report_forms/edit_employer_details.html.erb`) are referenced as examples but are **not listed in the doc's `source_ref.paths`**. This violates the "never silently drop" invariant: the doc claims these files as evidence but does not declare them as sources.

**Severity:** Medium. Both files exist in the source and do demonstrate the claimed features correctly:
- `paidleave/app/views/staff/payments/new.html.erb` contains `<%= f.date_picker :pay_period_start_date, label: t(".pay_period_start") %>`
- `paidleave/app/views/employers/quarterly_wage_report_forms/edit_employer_details.html.erb` contains `<%= f.tax_id_field :employer_ein, label: t(".employer_ein_legend") %>`

But their omission from the frontmatter means future regenerations won't validate against them.

**Suggested fix:** Add both paths to `source_ref.paths` in the doc frontmatter:
```yaml
- paidleave/app/views/staff/payments/new.html.erb
- paidleave/app/views/employers/quarterly_wage_report_forms/edit_employer_details.html.erb
```

## All other claims verified

- The `strata_form_with` examples (edit_addresses, edit_name, etc.) match the source exactly.
- The `f.conditional` count ("Thirteen calls") is accurate (exact match: 13).
- The error handling flow through `ModelErrorPresenter`, `PresentsErrors`, and the `on_flow_update_invalid` hook is accurate.
- The claim that `Staff::DeterminationForm` does not mix in `PresentsErrors` is correct.
- The i18n key pattern is correct.
- The table entries for builders and their usage contexts are accurate.
- The split between `strata_form_with` (flows) and `us_form_with` (auth pages) is correct.
- The documentation drift note about `docs/paidleave/forms.md` is accurate.
