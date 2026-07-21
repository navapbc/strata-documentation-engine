---
id: example-strata-unemployment-form-builder
title: Form-builder field helpers (strata_form_with)
source: strata-unemployment
doc_type: example
tags: [example-app, form-builder, views, uswds]
related:
  - example-strata-unemployment-overview
  - example-strata-unemployment-attributes
  - example-strata-unemployment-flow
demonstrates: [form-builder]
summary: How the unemployment portal renders each flow page with strata_form_with and the SDK form-builder helpers (typed-attribute fields, yes_no, fieldset, conditional, date_picker, select).
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/views/unemployment_benefits_application_forms/edit_identity.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_contact.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_demographics.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_claim_dependents.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_most_recent_employer.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/edit_benefits.html.erb
verified: ok
last_documented: 2026-06-29
---

# Form-builder field helpers

Every flow page is a view that opens an SDK form with `strata_form_with` and renders fields off the
yielded builder `f`. The builder targets the application-form model and posts to the flow task's
update path:

```erb
<%# app/views/unemployment_benefits_application_forms/edit_identity.html.erb %>
<%= strata_form_with model: @unemployment_benefits_application_form, url: @flow_task.update_path, method: :patch do |f| %>
  <%= f.name :claimant_name, { legend: t(".claimant_name_legend"), hint: t(".claimant_name_hint"), large_legend: true } %>
  <%= f.memorable_date :date_of_birth, aria: { labelledby: "date-of-birth-heading" } %>
  <%= f.tax_id_field :claimant_ssn, { label: t(".claimant_ssn_label"), hint: t(".claimant_ssn_hint") } %>
  <%= f.email_field :email, { label: t(".email_label"), hint: t(".email_hint") } %>
  <%= render partial: "form_buttons", locals: { back_path: @flow_task.prev_path || @flow.start_path, f: f } %>
<% end %>
```

The first page (`new.html.erb`) uses the simplest form: `strata_form_with(model: ...)` with no
explicit URL.

## Typed-attribute field helpers

Each typed `strata_attribute` (see [attributes](./attributes.md)) has a matching builder helper
that renders the whole compound input:

- `f.name :claimant_name` — first/middle/last/suffix name inputs.
- `f.memorable_date :date_of_birth` — month/day/year date inputs.
- `f.address_fields :mailing_address` / `f.address_fields :employer_address` — street/city/state/zip
  (used in `edit_contact` and `edit_most_recent_employer`).
- `f.tax_id_field :claimant_ssn` — SSN/tax-id input.

## General field helpers

Beyond the typed-attribute helpers, the pages use general SDK builder helpers:

- `f.yes_no :receiving_social_security, { legend: ... }` — boolean yes/no radio group (used widely:
  `edit_benefits`, `edit_citizenship`, `edit_wages`, etc.).
- `f.fieldset t(".gender_legend"), attribute: :gender do ... end` wrapping `f.radio_button`
  options — single-select radio groups (`edit_demographics`, `edit_education`,
  `edit_most_recent_employer`, `edit_tax_and_payment`).
- `f.select :number_of_dependent_children, [...], { label: ... }` — dropdown
  (`edit_claim_dependents`, `edit_demographics`).
- `f.date_picker :employment_start_date, { label: ... }` — calendar date picker
  (`edit_most_recent_employer`, `edit_occupation`, `edit_claim_dependents`).
- `f.text_field` / `f.email_field` — plain text and email inputs.
- `f.submit t("actions.save_and_continue")` — the submit button (in the `_form_buttons` partial).

## Conditional fields

The builder supports progressive disclosure with `f.conditional`, which reveals nested fields based
on another field's value. For example, dependent details only appear when the claimant says they
wish to claim dependents:

```erb
<%# app/views/unemployment_benefits_application_forms/edit_claim_dependents.html.erb %>
<%= f.yes_no :wishes_to_claim_dependents, { legend: t(".wishes_to_claim_dependents_legend") } %>
<%= f.conditional(:wishes_to_claim_dependents, eq: "true") do %>
  <%= f.select :number_of_dependent_children, [ ... ], { label: ... } %>
  <%= f.yes_no :has_dependent_spouse, { legend: t(".has_dependent_spouse_legend") } %>
  <%= f.conditional(:has_dependent_spouse, eq: "true") do %>
    <%= f.text_field :spouse_name, { label: t(".spouse_name_label") } %>
  <% end %>
<% end %>
```

`f.conditional(<field>, eq: <value>)` blocks can nest, as shown above (spouse fields inside the
dependents block). The same pattern gates `branch_of_service` on `is_veteran`, `return_date` on
`has_return_date`, and `prior_claim_state` on `filed_claim_other_state`.
