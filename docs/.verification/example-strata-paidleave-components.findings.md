# Verification findings: example-strata-paidleave-components (round 2)

Doc: `docs/sources/strata-paidleave/components.md`
Source: `.sources/strata-paidleave` @ `954a71f395db52d539c5cc09a27feb9675e34cde`
Verified: 2026-09-04

## Summary

All five round 1 findings have been successfully resolved. Re-verification of the corrected doc
confirms:

- **ComponentComponentTable (lines 42–52)**: ButtonComponent options now correctly include
  `variant: :outline` / `:unstyled`, `type: :submit`, `classes:`, `data:`, `aria:`. Fixes #2.

- **strata_link_to claims (lines 54–63)**: Now correctly states 24 total uses, 23 with `as: :button`,
  14 with `variant: :outline`, 9 as primary buttons, 1 plain link. Fixes #1.

- **TableComponent example (lines 90–109)**: Now quotes all five headers and all five cells, no longer
  silently drops three columns. Fixes #4.

- **AccordionComponent description (line 257)**: Now correctly lists both `renders_one :heading` and
  `renders_one :body` with all four init parameters. Fixes #5.

- **Employee-wage repeater description (lines 268–270)**: Now correctly distinguishes between the three
  blank rows seeded in the view and the 50-row validation cap. Fixes #3.

## Findings

None. All claims in the document are accurate and fully supported by source code at the verified commit.

## Verification detail

Spot-checked:
- All 24 `strata_link_to` calls and their option patterns (Python: verified exact counts).
- All nine SDK component rows and their claimed options/slots (source view/component files).
- All code examples match source line-for-line (ach_credit_instructions, _form_buttons,
  leave_applications/show, leave_application_cases/index, row components, task row controller
  override, flow preview).
- The seven custom ViewComponents: TagComponent, LeaveApplications::StatusTagComponent,
  ExemptionRequests::StatusTagComponent, AccordionComponent, Documents::FileTableComponent,
  LeaveApplicationCaseRowComponent, TaskRowComponent.
- Constants BLANK_WAGE_RECORD_ROWS=3 and MANUAL_ENTRY_MAX_RECORDS=50.
- 42 preview files in paidleave/app/previews/**.
- Cross-references (related docs, business-process.md).

No inaccuracies, unsupported claims, or outdated information detected.
