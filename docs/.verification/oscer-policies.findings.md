# Verification findings: oscer-policies (round 1)

Doc: `docs/sources/oscer/policies.md`
Source: `.sources/oscer`

## Result: No findings

Every claim in the doc was re-checked against the source and is fully supported:

- `ActivityReportApplicationFormPolicy` and `ExemptionApplicationFormPolicy` include
  `Strata::ApplicationFormPolicy` and alias the stated extra actions
  (`doc_ai_upload? -> edit?`, `accept_doc_ai? -> update?`, `documents?/upload_documents? -> edit?`).
  Verified in `reporting-app/app/policies/activity_report_application_form_policy.rb` and
  `.../exemption_application_form_policy.rb`.
- `Strata::TaskPolicy` (`reporting-app/app/policies/strata/task_policy.rb`) is defined under the
  `Strata` namespace and subclasses `::StaffPolicy`. Page-level actions (`index?`,
  `pick_up_next_task?`) use `staff?`; record-level actions (`show?`, `update?`, `assign?`,
  `request_information?`, `create_information_request?`) use `staff_in_region?`. `Scope#resolve`
  returns `scope.none` unless `user&.staff?`, else `scope.by_region(user.region)`.
- `StaffPolicy` is OSCER's own policy (`reporting-app/app/policies/staff_policy.rb`) and defines
  the `staff_in_region?` helper. Confirmed.
- `OscerTask.policy_class` returns `Strata::TaskPolicy`
  (`reporting-app/app/models/oscer_task.rb:7-9`). Confirmed.
- `TasksController#filter_tasks` calls
  `policy_scope super, policy_scope_class: Strata::TaskPolicy::Scope`
  (`reporting-app/app/controllers/tasks_controller.rb:107-109`). Confirmed.
- `Strata::Task.by_region` is monkey-patched in
  `reporting-app/config/initializers/strata_task_extensions.rb`; it inner-joins tasks to
  `CertificationCase` and `Certification` and merges `Certification.by_region(region)`. Confirmed.
- `Certification.by_region` exists (`reporting-app/app/models/certification.rb:20`). Confirmed.
