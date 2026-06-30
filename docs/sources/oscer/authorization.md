---
id: example-oscer-authorization
title: OSCER — authorization policies
source: oscer
doc_type: example
tags: [example-app, oscer, policies, authorization, pundit, region-scoping]
related:
  - example-oscer-overview
  - example-oscer-tasks
  - example-oscer-application-forms
demonstrates: [policies]
summary: How OSCER builds on Strata::TaskPolicy and Strata::ApplicationFormPolicy for task and application-form authorization, including region-based query scoping.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: a4fc94b35ed737d20ca4530efe20d579ce5f0d53
  paths:
    - reporting-app/app/policies/strata/task_policy.rb
    - reporting-app/app/policies/activity_report_application_form_policy.rb
    - reporting-app/app/policies/exemption_application_form_policy.rb
    - reporting-app/app/policies/activity_report_information_request_policy.rb
    - reporting-app/app/controllers/tasks_controller.rb
verified: ok
last_documented: 2026-06-29
---

# OSCER — authorization policies

OSCER authorizes access with Pundit-style policies and uses the SDK's policy surface
(`Strata::TaskPolicy`, `Strata::ApplicationFormPolicy`) for the SDK-provided task and
application-form resources.

## Task policy with region scoping

`Strata::TaskPolicy` is reopened by the app under `app/policies/strata/task_policy.rb`. It subclasses
the app's `StaffPolicy` and defines the action predicates the SDK task controller checks, splitting
collection-level actions (any staff) from record-level actions (staff in the same region):

```ruby
module Strata
  class TaskPolicy < ::StaffPolicy
    # Collection/page-level — any staff
    def index? = staff?
    def pick_up_next_task? = staff?

    # Individual task actions — must be in the same region
    def show? = staff_in_region?
    def update? = staff_in_region?
    def assign? = staff_in_region?
    def request_information? = staff_in_region?
    def create_information_request? = staff_in_region?

    # Scopes the SDK's Strata::Task query to the caseworker's region
    class Scope < ::StaffPolicy::Scope
      def resolve
        return scope.none unless user&.staff?
        scope.by_region(user.region)
      end
    end

    private

    def in_region?
      user.region == ::TaskService.get_region_for_task(record)
    end
  end
end
```

`OscerTask.policy_class` returns `Strata::TaskPolicy`, wiring the SDK's task model to this policy
(see [tasks](./tasks.md)). The `TasksController` calls `policy_scope(Strata::Task)` (and explicitly
`Strata::TaskPolicy::Scope` in `filter_tasks`) so caseworkers only see and pick up tasks in their
region, and calls `authorize @task` / `authorize Strata::Task` per action.

## Application-form policies

The application-form policies include the SDK's `Strata::ApplicationFormPolicy` and add app-specific
action aliases:

```ruby
# app/policies/activity_report_application_form_policy.rb
class ActivityReportApplicationFormPolicy < ApplicationPolicy
  include Strata::ApplicationFormPolicy

  alias_method :doc_ai_upload?, :edit?
  alias_method :accept_doc_ai?, :update?
end
```

```ruby
# app/policies/exemption_application_form_policy.rb
class ExemptionApplicationFormPolicy < ApplicationPolicy
  include Strata::ApplicationFormPolicy

  alias_method :documents?, :edit?
  alias_method :upload_documents?, :edit?
end
```

The information-request policies likewise `include Strata::ApplicationFormPolicy` and override
`update?` to assert the requesting user owns the underlying application form
(`application_form.user_id == user.id` — `app/policies/activity_report_information_request_policy.rb`).

## Base policies (app-side)

`Strata::ApplicationFormPolicy` is mixed into policies that inherit from the app's `ApplicationPolicy`
(a default-deny base) and, for tasks, `StaffPolicy` (which gates on `staff?`/`admin?` roles and adds
`staff_in_region?`). The SDK policy concern supplies the per-action defaults the application-form and
task controllers authorize against; the app extends them with role checks, region scoping, and
ownership rules.
</content>
