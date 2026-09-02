# Verification findings — example-oscer-tasks (round 1)

Doc: `docs/sources/oscer/tasks.md`
Source: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750`

Verified every claim against source. The doc is largely accurate: the three task-kind
declarations, `OscerTask` base class (default `due_on`, `policy_class` returning the
app-defined `Strata::TaskPolicy`, `ensure_application_form`), the three concrete staff-task
subclasses, and the controller's `policy_scope` overrides and scope usage all match source.
Two low-severity issues remain.

## Findings

### 1. (low) Controller override list omits `assign`

- **claim**: "It overrides `index`, `pick_up_next_task`, and `filter_tasks` to apply `policy_scope` ... and adds information-request actions."
- **issue**: `TasksController` also overrides `assign` (an action inherited from `Strata::TasksController`), wrapping it in an `Strata::AuditLog.record` block. The doc lists only three overridden actions, so a reader would assume `assign` is inherited unchanged; the doc does reference `assign` later, but not as an override.
- **evidence**: `.sources/oscer/reporting-app/app/controllers/tasks_controller.rb:29-43` (`def assign` with audit-log wrapping).
- **suggested_fix**: Add `assign` to the list of overridden actions (e.g. "overrides `index`, `assign`, `pick_up_next_task`, and `filter_tasks`").

### 2. (low) Referenced helper file not listed in `source_ref.paths`

- **claim**: Frontmatter `source_ref.paths` enumerates the backing files; the body cites `app/helpers/strata/tasks_helper.rb` for task-status tabs.
- **issue**: The tab-helper file the body relies on is not among the listed `source_ref.paths`, so the frontmatter's file list is incomplete relative to the body's citations. The helper's content itself is accurately described (tabs for assigned/pending, on_hold, completed).
- **evidence**: doc frontmatter lines 16-22 (paths list); body line 116 cites `app/helpers/strata/tasks_helper.rb`; file exists at `.sources/oscer/reporting-app/app/helpers/strata/tasks_helper.rb`.
- **suggested_fix**: Add `reporting-app/app/helpers/strata/tasks_helper.rb` to `source_ref.paths`.
