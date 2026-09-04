---
doc_id: example-strata-paidleave-cases-and-tasks
source_ref: 954a71f395db52d539c5cc09a27feb9675e34cde
verified_at: 2026-09-04
round: 2
status: verified
findings_count: 0
---

# Verification: Leave application cases and tasks

## Summary

Document fully verified. All claims are supported by the source code at the documented commit.

## Coverage

### Models verified
- `LeaveApplicationCase`: All methods, associations, and behavior match documented implementation
- `StaffLeaveReviewTask`: Confirmed as bare subclass with no custom implementation
- `LeaveApplication`: All relevant associations and methods verified
- `User`: Task association correctly configured

### Controllers verified
- `StaffController`: Inherits from `Strata::StaffController`, `case_classes`, `header_links` all match
- `TasksController`: Swaps task row component as documented
- `LeaveApplicationCasesController`: Index and closed actions match documented queries

### Services & Jobs verified
- `DeterminationRecorder`: Task completion logic with safe navigation (`&.`) matches documentation
- `CreateLeaveApplicationCaseJob`: Correctly identified as external case management notification

### Views verified
- `tasks.html.erb`: Confirmed as placeholder with expected content
- `_tasks_sidebar.html.erb`: Confirmed current/upcoming split logic using `due_on`

### Other components verified
- `TaskRowComponent`: Correctly translates task type using underscore
- `LeaveApplicationCaseSerializer`: Emits `type` field as documented
- `LeaveApplicationBusinessProcess`: `start_on_application_form_created(SUBMIT_APPLICATION)` confirmed

## Findings

**No findings. Document is fully verified.**

All code snippets, method signatures, associations, behavior descriptions, and references to other files are accurate and supported by the source code.
