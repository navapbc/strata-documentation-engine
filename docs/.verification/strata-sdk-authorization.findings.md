# Verification findings: strata-sdk-authorization (round 1)

Doc: `docs/sources/strata-sdk/strata-sdk-authorization.md`
Source: `.sources/strata-sdk`
Files checked:
- `app/policies/strata/application_form_policy.rb`
- `docs/authorization.md`

## Result: PASS — no findings

All claims in the doc are fully supported by the source.

## Claims checked

- **It is a module mixed into a Pundit policy** — confirmed: `module ApplicationFormPolicy`
  in `app/policies/strata/application_form_policy.rb` line 9.
- **`index?` / `create?` allowed when a user is logged in** — confirmed: both return `user`
  (truthy check) at lines 10-12 and 17-19.
- **`show?` => `owner?`** — confirmed at line 14-16.
- **`update?` / `review?` / `destroy?` => `owner? && record.in_progress?`** — confirmed
  at lines 22-24, 26-28, 30-32.
- **`submit?` => `owner? && !record.submitted?`** — confirmed at lines 34-36.
- **`owner?` is `record.user_id == user.id`** — confirmed at lines 47-49.
- **Nested `Scope` resolves to `scope.where(user_id: user.id)`** — confirmed at lines 39-43.
- **`Scope` subclasses `::ApplicationPolicy::Scope`** — confirmed: `class Scope < ::ApplicationPolicy::Scope` at line 39.
- **Record exposes `user_id`, `in_progress?`, `submitted?`** — confirmed: all three are used
  directly in policy methods.
- **Owner-centric defaults; staff/audit needs its own policy** — consistent with
  `docs/authorization.md` and policy module scope.
- **Usage example: `include Strata::ApplicationFormPolicy`** — confirmed in `docs/authorization.md`.

## Notes (not findings)

- The "Rules" table omits the inherited `new?` (=> `create?`) and `edit?` (=> `update?`)
  predicates that the host `ApplicationPolicy` provides. This is a reasonable scoping choice
  (the module itself defines only the listed methods) and not an inaccuracy about
  `Strata::ApplicationFormPolicy`.
