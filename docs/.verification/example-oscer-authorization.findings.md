# Verification findings — example-oscer-authorization (round 1 + round 2)

Doc: `docs/sources/oscer/authorization.md`
Source: `.sources/oscer` @ `be3ffbb4e7b7e7cf0b4047af5544870f50619257` (cross-checked against `.sources/strata-sdk`)

## Round 1 findings (all resolved)

1. `Strata::TaskPolicy` presented as an SDK policy → **RESOLVED**: Doc now clearly states "the app
   itself defines a `Strata::TaskPolicy`" and "(the SDK ships no `TaskPolicy` of its own)".
2. `authorize Strata::Task` described as per-action → **RESOLVED**: Doc now states "Authorization
   is split by action shape: `authorize_staff_access` returns early unless the action is `index` or
   `pick_up_next_task`; every record-level action instead authorizes via `authorize @task`".
3. `StaffPolicy` said to gate on `staff?`/`admin?` → **RESOLVED**: Doc now states "gates every one
   of its own predicates on `staff?` alone — `admin?` is delegated but unused by those checks".

## Round 2 findings (RESOLVED)

### 1. TaskPolicy code examples use shorthand method syntax not in source (medium)

- **Claim**: Code block shows TaskPolicy methods using shorthand syntax:
  ```ruby
  def index? = staff?
  def pick_up_next_task? = staff?
  def show? = staff_in_region?
  ```
- **Issue**: The actual source at `reporting-app/app/policies/strata/task_policy.rb` consistently
  uses traditional multi-line method syntax for all methods.
- **Evidence**: `reporting-app/app/policies/strata/task_policy.rb:12-39` (all methods use
  traditional syntax with explicit `end`); no shorthand method definitions appear anywhere in the
  OSCER codebase.
- **Fix**: ✅ RESOLVED — Doc now shows traditional multi-line method syntax matching source exactly.

## Round 3 findings

No findings — all claims verified against source checkout at commit `be3ffbb4e7b7e7cf0b4047af5544870f50619257`. The TaskPolicy code block correctly uses traditional multi-line syntax (no shorthand). All other code blocks and explanations verified as accurate.

## Verified as accurate (round 1 + round 2 + round 3)

- `Strata::TaskPolicy` predicates, `Scope#resolve`, and private `in_region?` logic match source
  exactly (only the code formatting differs from actual syntax style).
- `OscerTask.policy_class` returns `Strata::TaskPolicy`.
- `filter_tasks` passes `policy_scope_class: Strata::TaskPolicy::Scope`; `index` and `pick_up_next_task`
  use `policy_scope(Strata::Task)`.
- Both application-form policies' `include` + `alias_method` lines are exact matches.
- Information-request policies override `update?` with correct owner checks.
- `ApplicationPolicy` is default-deny with no-user error handling.
- `StaffPolicy::Scope` is `user.staff? ? scope.all : scope.none` with documented TODOs and issues.
- API authentication via `Api::Client` with documented role structure.
