# Verification findings: example-oscer-authorization (round 1)

Doc: `docs/sources/oscer/authorization.md`
Source: `.sources/oscer` @ c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750 (matches `source_ref.ref`)

## Result: fully supported

All claims were re-checked against the source and verified.

| Doc claim | Source evidence | Verdict |
|---|---|---|
| `Strata::TaskPolicy < ::StaffPolicy`; `index?`/`pick_up_next_task?` = `staff?`; `show?`/`update?`/`assign?`/`request_information?`/`create_information_request?` = `staff_in_region?` | `reporting-app/app/policies/strata/task_policy.rb:10-39` | Supported |
| `Scope < ::StaffPolicy::Scope#resolve` returns `scope.none unless user&.staff?` else `scope.by_region(user.region)` | `strata/task_policy.rb:43-49` | Supported |
| Private `in_region?` via `user.region == ::TaskService.get_region_for_task(record)` | `strata/task_policy.rb:53-55` | Supported |
| `OscerTask.policy_class` returns `Strata::TaskPolicy` | `app/models/oscer_task.rb:7-9` | Supported |
| `TasksController` uses `policy_scope(Strata::Task)`, explicit `Strata::TaskPolicy::Scope` in `filter_tasks`, `authorize @task` / `authorize Strata::Task` | `app/controllers/tasks_controller.rb:17,108,138,176` | Supported |
| `ActivityReportApplicationFormPolicy` includes concern, aliases `doc_ai_upload? -> edit?`, `accept_doc_ai? -> update?` | `activity_report_application_form_policy.rb:4-7` | Supported |
| `ExemptionApplicationFormPolicy` includes concern, aliases `documents?`/`upload_documents? -> edit?` | `exemption_application_form_policy.rb:4-7` | Supported |
| Information-request policies override `update?` to assert `application_form.user_id == user.id` | `activity_report_information_request_policy.rb:5-9`; `exemption_information_request_policy.rb:5-9` | Supported |
| `ApplicationPolicy` default-deny (predicates return `false`) | `application_policy.rb` | Supported |
| `StaffPolicy` gates on `staff?`/`admin?` (delegated) and adds `staff_in_region?` (`staff? && in_region?`) | `staff_policy.rb:32-34,45-46` | Supported |

## Note (not a finding)

The doc renders the task-policy predicates in endless-method form (`def index? = staff?`); the
source uses the equivalent multi-line `def index?; staff?; end`. Semantically identical and
presented as a condensed illustration, not verbatim source.

No inaccurate, unsupported, or outdated statements found.
