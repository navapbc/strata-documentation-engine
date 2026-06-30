---
id: strata-sdk-audit-log
title: Audit log
source: strata-sdk
doc_type: feature
tags: [strata-sdk, audit-log, immutable, transactions, virtual-actor]
related:
  - strata-sdk-determination
  - strata-sdk-authorization
feature_keys:
  - audit-log
  - virtual-actor
  - concerns/auditable
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: An immutable, transaction-coupled audit trail (Strata::AuditLog / AuditLine), the Auditable concern, and VirtualActor for non-AR actors.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/audit_log.rb
    - app/models/strata/audit_line.rb
    - app/models/strata/virtual_actor.rb
    - app/models/concerns/strata/auditable.rb
    - docs/strata-audit-log.md
verified: ok
last_documented: 2026-06-29
---

# Audit log

The Strata Audit Log records an immutable trail — who did what, to which record, with free-form
context — that commits or rolls back atomically with the surrounding domain writes.

## Writing entries

`Strata::AuditLog` (`app/models/strata/audit_log.rb`) is the developer-facing API.

**Block form** — atomic with the caller's work. `Strata::AuditLog.record(actor:)` opens an
`ActiveRecord::Base.transaction`, yields a log object, and commits everything together; if the
block raises, all appended lines roll back. It returns the `AuditLog` with `.lines` populated, and
raises `ArgumentError` if called without a block.

```ruby
Strata::AuditLog.record(actor: current_user) do |log|
  case_record.update!(status: :approved)
  log.add_line(action: "case.approved", subject: case_record, data: { previous_status: "pending" })
end
```

**Single-line form** — `Strata::AuditLog.write!(action:, actor: nil, subject: nil, data: {})`
creates one line outside any wrapper transaction.

`add_line` / `write!` parameters: `action` (required String), `subject` (any AR record,
polymorphic), `actor` (any AR record; `add_line` falls back to the `actor:` passed to `record`),
and `data` (free-form jsonb; `nil` is coerced to `{}`). **You are responsible for screening `data`
for PII** — there is no automatic redaction.

## Querying history

`Strata::Auditable` (`app/models/concerns/strata/auditable.rb`) adds
`has_many :audit_lines, as: :subject, class_name: "Strata::AuditLine"`. It is opt-in (deliberately
**not** mixed into `Strata::ApplicationForm`) and intentionally omits `dependent: :destroy` so the trail
outlives its subject.

```ruby
class Case < ApplicationRecord
  include Strata::Auditable
end

case_record.audit_lines.latest_first
Strata::AuditLine.by_actor(current_user).with_action("case.approved")
```

`Strata::AuditLine` scopes: `for_subject(record)`, `by_actor(record)`, `with_action(name)` (accepts
symbols), `latest_first` (by `created_at` desc).

## Immutability

`Strata::AuditLine#readonly?` returns `true` once persisted, so `update!`/`destroy` on a saved line
raise `ActiveRecord::ReadOnlyRecord`. This is application-level enforcement, not a DB constraint.

## Virtual actors

`Strata::VirtualActor` (`app/models/strata/virtual_actor.rb`) is a marker module for non-ActiveRecord
actor classes (e.g. an API client). When such an actor is assigned, `AuditLine` stores its class
name in `actor_type` with `actor_id = nil`, and `AuditLine#actor` round-trips it as a
`Strata::VirtualActor::Instance` value object (identity is the class name only;
`display_name` humanizes it).

```ruby
class Api::Client
  include Strata::VirtualActor
end
Strata::AuditLog.write!(action: "system.synced", actor: Api::Client.new)
```

## Schema

`strata_audit_lines` (UUID PK, immutable rows): `action` (string, not null), polymorphic
`subject_type`/`subject_id` and `actor_type`/`actor_id` (nullable), `data` (jsonb, not null, default `{}`),
`created_at` (no `updated_at`). Indexed on `(subject_type, subject_id, created_at DESC)`,
`(actor_type, actor_id)`, and `created_at`.

## Installation

The model, concern, and API ship with the engine; only the migration is installed in the host app:

```bash
bin/rails generate strata:audit_log
bin/rails db:migrate
```

## Gotchas

- **Nested transactions become savepoints:** inside an outer `ActiveRecord::Base.transaction`,
  `raise ActiveRecord::Rollback` in the block only rolls back the savepoint — raise a real
  exception to roll back the outer unit of work.
- **`after_commit` fires only on the outermost commit**, so lines created in a nested transaction
  may reach downstream sinks later than expected.
- **No cascade-delete:** `audit_line.subject` returns `nil` after the subject is destroyed, but the
  `subject_type`/`subject_id` columns are preserved for querying by class+id.
- **Polymorphic class-name drift:** columns store the **concrete** class name string (e.g.
  `"PassportApplicationForm"`, not `"Strata::ApplicationForm"`); filter by the concrete name or use
  `for_subject(record)`.
- **Thread safety:** `.lines` is not thread-safe across threads spawned inside the block (persisted
  rows are still correct; query `AuditLine` directly in that case).
