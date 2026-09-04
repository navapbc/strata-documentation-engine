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
  - example-oscer-api-authentication
demonstrates: [policies]
summary: How OSCER defines Strata::TaskPolicy in the SDK namespace and mixes in the SDK's Strata::ApplicationFormPolicy for task and application-form authorization, including region-based query scoping.
source_ref:
  repo: https://github.com/navapbc/oscer
  ref: "be3ffbb4e7b7e7cf0b4047af5544870f50619257"
  paths:
    - reporting-app/app/policies/strata/task_policy.rb
    - reporting-app/app/policies/activity_report_application_form_policy.rb
    - reporting-app/app/policies/exemption_application_form_policy.rb
    - reporting-app/app/policies/activity_report_information_request_policy.rb
    - reporting-app/app/policies/staff_policy.rb
    - reporting-app/app/policies/application_policy.rb
    - reporting-app/app/controllers/tasks_controller.rb
last_documented: 2026-09-04
verified: ok
---

# OSCER — authorization policies

OSCER authorizes access with Pundit-style policies covering the SDK-provided task and
application-form resources. Application-form policies mix in the SDK-provided
`Strata::ApplicationFormPolicy`; for tasks, the app itself defines a `Strata::TaskPolicy` inside the
SDK's namespace to authorize the SDK's `Strata::Task` model (the SDK ships no `TaskPolicy` of its
own).

## Task policy with region scoping

The app defines `Strata::TaskPolicy` under `app/policies/strata/task_policy.rb` — placed in the SDK's
`Strata` namespace so it pairs with the SDK's `Strata::Task` model, but app-owned code, not reopened
SDK code. It subclasses the app's `StaffPolicy` and defines the action predicates the SDK task
controller checks, splitting
collection-level actions (any staff) from record-level actions (staff in the same region):

```ruby
module Strata
  class TaskPolicy < ::StaffPolicy
    # Collection/page-level actions - any staff can access
    def index?
      staff?
    end

    def pick_up_next_task?
      staff?
    end

    # Individual task actions - must be in same region
    def show?
      staff_in_region?
    end

    def update?
      staff_in_region?
    end

    def assign?
      staff_in_region?
    end

    def request_information?
      staff_in_region?
    end

    def create_information_request?
      staff_in_region?
    end

    # Scopes tasks to only show records from the user's region
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
region. Authorization is split by action shape: `authorize_staff_access` returns early unless the
action is `index` or `pick_up_next_task`, in which case it authorizes the `Strata::Task` class; every
record-level action instead authorizes the loaded record via `authorize @task` in `set_task`.

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
`update?` to assert the requesting user owns the underlying application form:

```ruby
# app/policies/activity_report_information_request_policy.rb
def update?
  application_form = ActivityReportApplicationForm.find(record.application_form_id)
  application_form.user_id == user.id
end
```

(`ExemptionInformationRequestPolicy` does the same against `ExemptionApplicationForm`.)

## Base policies (app-side)

`Strata::ApplicationFormPolicy` is mixed into policies that inherit from the app's `ApplicationPolicy`
(a default-deny base — every predicate returns `false` until overridden, and the constructor raises
`Pundit::NotAuthorizedError` when there is no user at all). Tasks go through `StaffPolicy`, which
delegates both `staff?` and `admin?` to the user but gates every one of its own predicates
(`index?`, `closed?`, `show?`, `create?`, `update?`, `search?`) on `staff?` alone — `admin?` is
delegated but unused by those checks — and adds `staff_in_region?` (`staff? && in_region?`). The SDK
policy concern supplies the per-action defaults the application-form controllers authorize against;
the app extends them with role checks, region scoping, and ownership rules.

`StaffPolicy::Scope` is the deliberately blunt fallback — `user.staff? ? scope.all : scope.none`,
with a TODO and two open issues for restricting it by region. Task queries do not rely on it, since
`Strata::TaskPolicy::Scope` overrides `resolve` with the region filter.

The API surface authorizes against the same policies with a non-`User` principal: `ApiController`
sets `pundit_user` to an `Api::Client` (`state_system?` true, `staff?`/`member?`/`admin?` false) —
see [API authentication](./api-authentication.md).
