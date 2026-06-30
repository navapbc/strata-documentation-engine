---
id: strata-sdk-form-builder
title: Form builder and SDK components
source: strata-sdk
doc_type: feature
tags: [strata-sdk, form-builder, uswds, components, view-helpers]
related:
  - strata-sdk-form-flows
  - strata-sdk-attributes
feature_keys:
  - form-builder
  - components
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The USWDS-styled Strata form builder helpers and the catalog of Strata SDK components.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - docs/strata-form-builder.md
    - docs/strata-sdk-components.md
    - docs/strata-view-helpers.md
verified: ok
last_documented: 2026-06-29
---

# Form builder and SDK components

## Form builder

The Strata form builder is a custom Rails form builder that renders
[USWDS](https://designsystem.digital.gov/)-styled, accessible form components. Beyond adding USWDS
classes it sets labels/hints via field helpers, displays inline error messages and styling, and
adds helpers for both basic elements and complex Strata value types.

Use it via `strata_form_with`:

```erb
<%= strata_form_with(model: @leave_application, url: update_personal_info_path(@leave_application), method: :patch) do |f| %>
  <%= f.name :applicant_name, { legend: t(".applicant_name_title"), hint: t(".applicant_name_hint"), large_legend: true } %>
  <%= f.submit "Save" %>
<% end %>
```

### Helper categories

- **Standard Rails helpers (USWDS-styled overrides):** `email_field`, `file_field`,
  `password_field`, `text_area`, `text_field`, `check_box`, `radio_button`, `select`, `submit`.
- **Basic helpers:** `fieldset`, `form_group`, `hint`, `conditional` (Stimulus-driven conditional
  fields), `honeypot_field`.
- **Complex helpers (for Strata attribute types):** `address_fields`, `date_picker`, `date_range`,
  `memorable_date`, `money_field`, `name`, `tax_id_field`, `yes_no`.

The text-input helpers (`email_field`, `file_field`, `password_field`, `text_area`, `text_field`)
each accept: `label`, `hint`, `label_class`, `group_options`, `skip_form_group`, plus the
underlying Rails helper's HTML options. Other helpers have narrower option sets (e.g. `check_box`
only adds `label`; `submit` only adds `big`).

## SDK components catalog

`docs/strata-sdk-components.md` indexes the building blocks the engine provides:

- **Strata Data Modeler** — define data models declaratively with Strata attributes (replaces dozens
  of hand-written `attribute` lines). See [Strata attributes](./strata-sdk-attributes.md).
- **Strata Form Builder** — the USWDS form builder described above.
- **Multi-Page Form Flow** — the task-list-based multi-page form DSL. See
  [Multi-page form flows](./strata-sdk-form-flows.md).
- **Business Process Modeler** — applicant/staff/system/third-party steps with event-driven
  transitions. See [Business processes](./strata-sdk-business-process.md).
- **Task Management System** — custom staff task types, views, and actions. See
  [Tasks](./strata-sdk-tasks.md).
- **Policy as Code Rules Engine** — encode policy once for determinations and calculators. See
  [Rules engine](./strata-sdk-rules-engine.md).
- **Master Person Record** — a unified person view across systems (described as a component; no
  implementation was found under `app/`/`lib/` in this checkout — treat as roadmap).

There are also `strata_link_to` / `strata_button_to` view helpers (`docs/strata-view-helpers.md`).
`strata_button_to` always applies USWDS button styling; `strata_link_to` is a passthrough by
default and opts into USWDS styling via `as: :button` or `as: :external`.

## Gotchas

- Conditional fields and other interactive components rely on Stimulus controllers; register them
  with `registerControllers(application)` (see [Getting started](./strata-sdk-getting-started.md)).
- This doc distills the form-builder/component reference docs; for the exhaustive per-helper option
  lists consult `docs/strata-form-builder.md` and `docs/uswds-components.md` in the SDK repo.
