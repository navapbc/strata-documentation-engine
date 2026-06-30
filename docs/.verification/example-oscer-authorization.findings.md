# Verification findings: example-oscer-authorization (round 1)

Doc: `docs/sources/oscer/authorization.md`
Source: `.sources/oscer` @ a4fc94b35ed737d20ca4530efe20d579ce5f0d53 (matches `source_ref.ref`)

## Result: fully supported

All claims were re-checked against the source and verified:

- `Strata::TaskPolicy < ::StaffPolicy` with the exact action predicates and `Scope` shown — matches `reporting-app/app/policies/strata/task_policy.rb` verbatim (incl. `index?`/`pick_up_next_task?` = `staff?`; `show?`/`update?`/`assign?`/`request_information?`/`create_information_request?` = `staff_in_region?`; `Scope#resolve` returns `scope.none unless user&.staff?` else `scope.by_region(user.region)`; private `in_region?` via `::TaskService.get_region_for_task(record)`).
- `OscerTask.policy_class` returns `Strata::TaskPolicy` — matches `app/models/oscer_task.rb:7-9`.
- `TasksController` calls `policy_scope(Strata::Task)`, uses `Strata::TaskPolicy::Scope` in `filter_tasks` (`policy_scope super, policy_scope_class: Strata::TaskPolicy::Scope`, line 108), and calls `authorize @task` (138) / `authorize Strata::Task` (176) — all present.
- `ActivityReportApplicationFormPolicy` includes `Strata::ApplicationFormPolicy` and aliases `doc_ai_upload? -> edit?`, `accept_doc_ai? -> update?` — matches verbatim.
- `ExemptionApplicationFormPolicy` includes the concern and aliases `documents? -> edit?`, `upload_documents? -> edit?` — matches verbatim.
- Information-request policy `update?` asserts `application_form.user_id == user.id` in `activity_report_information_request_policy.rb` — matches (`ActivityReportApplicationForm.find(record.application_form_id).user_id == user.id`). (The same pattern also exists in `exemption_information_request_policy.rb`, consistent with the doc's plural "policies".)
- `ApplicationPolicy` is a default-deny base (all predicates return `false`) — matches `application_policy.rb`.
- `StaffPolicy` gates on roles and defines `staff_in_region?` (`staff? && in_region?`) — matches `staff_policy.rb`.

No inaccurate, unsupported, or outdated statements found.
