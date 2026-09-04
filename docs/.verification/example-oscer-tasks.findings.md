# Verification findings — example-oscer-tasks (round 1)

Doc: `docs/sources/oscer/tasks.md`
Source: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257`
Cross-checked against `.sources/strata-sdk` for SDK-level claims.

Verified as accurate: the `system_process` / `applicant_task` / `staff_task` declarations and the
services they call (`app/business_processes/certification_business_process.rb:23-46`); the
`report_activities` transitions being keyed off `*ApplicationFormSubmitted` events (lines 83, 89, 94);
`OscerTask`'s `due_on` default, `policy_class`, and `ensure_application_form` "oldest unattached form"
semantics (`app/models/oscer_task.rb`); the three concrete staff tasks' shape, form classes, and the
`approval_status` nil-until-decided comment; the SDK passing a `system_process` only the case
(`strata-sdk/app/models/strata/system_process.rb#execute`); the `pending`/`on_hold`/`completed` tabs
(`app/helpers/strata/tasks_helper.rb`) matching the SDK's `enum :status`
(`strata-sdk/app/models/strata/task.rb:33`); `policy_scope(Strata::Task).incomplete.unassigned` and
`with_status(:completed)` being real SDK scopes (task.rb:44-47); and region scoping living in
`Strata::TaskPolicy::Scope` (`app/policies/strata/task_policy.rb`).

## 1. `assign` is not one of the overrides that applies `policy_scope` (medium)

- **Claim**: "It overrides `index`, `assign`, `pick_up_next_task`, and `filter_tasks` to apply
  `policy_scope` (so caseworkers only see tasks in their region)".
- **Issue**: `assign` contains no `policy_scope` call. It is overridden to wrap the assignment in a
  `Strata::AuditLog.record` block; its authorization comes from the overridden `set_task`, which
  calls `authorize @task` (record-level, via `TaskPolicy#assign?` → `staff_in_region?`). Attributing
  `policy_scope` to all four overrides misstates how `assign` is authorized.
- **Evidence**: `.sources/oscer/reporting-app/app/controllers/tasks_controller.rb:30-45` (`assign`,
  no `policy_scope`), `:137-140` (`set_task` → `authorize @task`),
  `app/policies/strata/task_policy.rb` (`assign?` → `staff_in_region?`).
- **Fix**: Say the controller overrides `index`, `pick_up_next_task`, and `filter_tasks` to apply
  `policy_scope`, and overrides `assign` to add audit logging, with record-level authorization coming
  from the overridden `set_task`.

## 2. `assign(current_user.id)` is listed as a `Strata::Task` scope (low)

- **Claim**: "It queries the SDK's `Strata::Task` scopes directly — e.g.
  `policy_scope(Strata::Task).incomplete.unassigned`, `with_status(:completed)`, and
  `assign(current_user.id)`".
- **Issue**: `incomplete`, `unassigned`, and `with_status` are scopes; `assign` is an instance method
  on a task record and is always called on a single task (`@task.assign(...)`, `task.assign(...)`),
  never as a relation scope.
- **Evidence**: `.sources/strata-sdk/app/models/strata/task.rb:44-47` (scopes) vs `:64`
  (`def assign(user_id)`); `tasks_controller.rb:32,56`.
- **Fix**: Drop `assign(current_user.id)` from the scope list and mention it separately as the
  instance method the `assign`/`pick_up_next_task` actions call on the task they picked.

## 3. The `filter_tasks_by_status` override is unmentioned (low)

- **Claim**: the override list "`index`, `assign`, `pick_up_next_task`, and `filter_tasks`".
- **Issue**: `filter_tasks_by_status` is also overridden, and it is what actually maps the
  `completed` / `on_hold` / default-`pending` tab to `with_status(...)` — the `with_status(:completed)`
  call the doc cites lives there, not in `filter_tasks`. The doc as written leaves the reader looking
  for that call in the wrong method.
- **Evidence**: `.sources/oscer/reporting-app/app/controllers/tasks_controller.rb:112-121`.
- **Fix**: Add `filter_tasks_by_status` to the override list and attribute the `with_status` calls to
  it, next to the tab helper discussion.
