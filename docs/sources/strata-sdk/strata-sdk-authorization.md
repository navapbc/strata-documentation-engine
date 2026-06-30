---
id: strata-sdk-authorization
title: Authorization policies
source: strata-sdk
doc_type: feature
tags: [strata-sdk, authorization, pundit, policies]
related:
  - strata-sdk-application-form
  - strata-sdk-audit-log
feature_keys:
  - policies
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::ApplicationFormPolicy Pundit module providing secure owner-and-status-aware defaults for application forms.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/policies/strata/application_form_policy.rb
    - docs/authorization.md
verified: ok
last_documented: 2026-06-29
---

# Authorization policies

The SDK ships built-in [Pundit](https://github.com/varvet/pundit) policy modules with secure
defaults for government digital services.

## `Strata::ApplicationFormPolicy`

`Strata::ApplicationFormPolicy` (`app/policies/strata/application_form_policy.rb`) is a **module**
you mix into your own Pundit policy. It ensures a user can only access their own application form
and can modify it only while it is in progress.

```ruby
class MyApplicationFormPolicy < ApplicationPolicy
  include Strata::ApplicationFormPolicy
end
```

### Rules

| Action | Allowed when |
| --- | --- |
| `index?` | a user is logged in |
| `create?` | a user is logged in |
| `show?` | `owner?` |
| `update?` | `owner?` and `record.in_progress?` |
| `review?` | `owner?` and `record.in_progress?` |
| `destroy?` | `owner?` and `record.in_progress?` |
| `submit?` | `owner?` and `!record.submitted?` |

`owner?` is `record.user_id == user.id`. The nested `Scope` resolves to
`scope.where(user_id: user.id)`, so list queries return only the current user's forms.

## Gotchas

- It is a module, not a base class — `include` it into a policy that already subclasses your app's
  `ApplicationPolicy` (and whose `Scope` subclasses `ApplicationPolicy::Scope`).
- The rules assume the record exposes `user_id`, `in_progress?`, and `submitted?` — exactly what
  `Strata::ApplicationForm` provides.
- These are owner-centric applicant defaults; staff-facing access (e.g. listing actionable cases,
  reading audit lines) needs its own policies. The audit log explicitly has no safe global "see all"
  rule — see [Audit log](./strata-sdk-audit-log.md).
