---
id: strata-sdk-generators
title: Generators
source: strata-sdk
doc_type: feature
tags: [strata-sdk, generators, scaffolding, migrations]
related:
  - strata-sdk-application-form
  - strata-sdk-case
  - strata-sdk-business-process
  - strata-sdk-tasks
  - strata-sdk-attributes
  - strata-sdk-audit-log
feature_keys:
  - generators
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata Rails generators for scaffolding application forms, cases, business processes, tasks, models, migrations, audit log, and staff dashboards.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - docs/generators.md
    - lib/generators/strata/application_form/USAGE
    - lib/generators/strata/application_form_views/USAGE
    - lib/generators/strata/application_form_views/application_form_views_generator.rb
    - lib/generators/strata/case/USAGE
    - lib/generators/strata/migration/USAGE
    - lib/generators/strata/migration/migration_generator.rb
verified: ok
last_documented: 2026-06-29
---

# Generators

The SDK ships Rails generators (under `lib/generators/strata/`) for scaffolding the common building
blocks. There are **11** generators in this checkout: `application_form`, `application_form_views`,
`audit_log`, `business_process`, `case`, `determination`, `income_records_migration`, `migration`,
`model`, `staff`, and `task`.

## Recommended order for a new project

1. `strata:application_form` — your intake form model.
2. `strata:case` — the case model.
3. `strata:business_process` — the workflow.
4. `strata:task` — additional task types.

## Generator reference

| Generator | What it creates |
| --- | --- |
| `strata:application_form NAME [attr:type] [--parent CLASS]` | A model extending `Strata::ApplicationForm` (suffix `ApplicationForm` auto-appended). |
| `strata:application_form_views FLOW_CLASS FORM_CLASS` | Views for a multi-page form flow (one `edit_*.html.erb` per question page), a form layout at `app/views/layouts/<form_name>.html.erb`, and a locales file. |
| `strata:case NAME [attrs] [options]` | A `Strata::Case` model (suffix `Case` auto-appended); checks for the associated business process and application form, with `--business-process`, `--application-form`, `--skip-business-process`, `--skip-application-form`, `--sti` options. |
| `strata:business_process NAME` | A business process file that defines the workflow and wires the app to listen for events. |
| `strata:task NAME` | A `Strata::Task` subclass for a workflow task (verifies the `strata_tasks` table exists). |
| `strata:model NAME [attr:type]` | A Rails model supporting Strata attribute types. |
| `strata:migration NAME [attr:type]` | A migration mapping Strata attribute types to their columns. |
| `strata:income_records_migration NAME period_type` | An income-record table migration (period type `year_quarter` or `date_range`). |
| `strata:audit_log` | The `create_strata_audit_lines` migration (see [Audit log](./strata-sdk-audit-log.md)). |
| `strata:determination` | Scaffolding for determinations (see [Determinations](./strata-sdk-determination.md)). |
| `strata:staff` | Controllers, views, and tests for a staff dashboard / task management. |

```bash
bin/rails generate strata:application_form Passport name:name birth_date:memorable_date ssn:tax_id
bin/rails generate strata:case PassportCase
bin/rails generate strata:business_process PassportBusinessProcess
bin/rails generate strata:task review_application
```

Run `bin/rails generate strata:<generator_name> --help` for the full per-generator USAGE.

## Strata attribute → column mapping (migration generator)

The `strata:migration` generator maps each Strata attribute type to its database columns:

| Type | Columns |
| --- | --- |
| `address` | `street_line_1`, `street_line_2`, `city`, `state`, `zip_code` (all string) |
| `array` | a single jsonb column |
| `memorable_date` | a single date column |
| `money` | a single integer column (cents) |
| `name` | `first`, `middle`, `last`, `suffix` (all string) |
| `tax_id` | a single string column |
| `us_date` | a single date column |
| `year_month` | a single string column |
| `year_quarter` | a single string column |

The `:range` option (a trailing `:range` on an `attribute:type:range` argument) is the only
mechanism that splits an attribute into start/end columns: it recurses on the base type to emit
`<name>_start` and `<name>_end` columns. For example, `leave:memorable_date:range` produces
`leave_start` and `leave_end` date columns.

> **Source mismatch (USAGE vs. code).** The generator's `USAGE` file lists `date_range`
> (`start`, `end` dates), `year_month`/`year_quarter` (two integer columns), and
> `year_quarter_range` (four integer columns), but `migration_generator.rb` implements none of
> these as distinct branches. `year_month` and `year_quarter` each map to a single `:string`
> column, and `date_range`/`year_quarter_range` have no `case` branch — they fall through to the
> `else` clause and emit a literal `#{name}:date_range` / `#{name}:year_quarter_range`, which is
> not a valid Rails column type. Use the `:range` option above for start/end columns.

## Gotchas

- The migration generator's `name` mapping produces all four columns — `<name>_first`,
  `<name>_middle`, `<name>_last`, and `<name>_suffix` (all string) — so no manual `suffix` column
  is needed.
- Generators that create models also create their migrations (unless `--skip-migration`); the
  engine itself ships no migrations — all migrations land in the host app (in this repo, the dummy
  app under `spec/dummy/db/migrate/`).
- The `case` generator depends on the `FooCase` ↔ `FooBusinessProcess` ↔ `FooApplicationForm`
  naming convention; use the skip flags to bypass the existence checks.
