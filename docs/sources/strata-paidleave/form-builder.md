---
id: example-strata-paidleave-form-builder
title: strata_form_with and the SDK field helpers
source: strata-paidleave
doc_type: example
tags: [example-app, form-builder, uswds, views, errors]
related:
  - example-strata-paidleave-overview
  - example-strata-paidleave-flows
  - example-strata-paidleave-attributes
  - example-strata-paidleave-value-objects
  - example-strata-paidleave-components
demonstrates:
  - form-builder
summary: Every SDK form-builder helper the paid leave app uses, how error anchors are built by instantiating Strata::FormBuilder directly, and how the SDK builder coexists with the app's own us_form_with on the auth pages.
source_ref:
  repo: https://github.com/navapbc/strata-paidleave
  ref: 954a71f395db52d539c5cc09a27feb9675e34cde
  paths:
    - paidleave/app/views/leave_applications/edit_addresses.html.erb
    - paidleave/app/views/leave_applications/edit_name.html.erb
    - paidleave/app/views/leave_applications/edit_date_of_birth.html.erb
    - paidleave/app/views/leave_applications/edit_tax_identifier.html.erb
    - paidleave/app/views/leave_applications/edit_payment_preferences.html.erb
    - paidleave/app/views/employers/contribution_payment_forms/edit_amount_and_method.html.erb
    - paidleave/app/views/employers/quarterly_wage_report_forms/edit_period_and_method.html.erb
    - paidleave/app/views/employers/exemption_requests/edit_commercial_plan_details.html.erb
    - paidleave/app/views/leave_application_cases/_determination_drawer_form.html.erb
    - paidleave/app/presenters/model_error_presenter.rb
    - paidleave/app/presenters/presents_errors.rb
    - paidleave/app/models/staff/determination_form.rb
    - paidleave/app/views/staff/employers/_form.html.erb
    - paidleave/app/views/staff/information_requests/new.html.erb
    - paidleave/app/views/change_requests/new.html.erb
    - paidleave/app/helpers/application_helper.rb
    - paidleave/app/helpers/uswds_form_builder.rb
    - docs/paidleave/forms.md
last_documented: 2026-09-04
verified: ok
---

# strata_form_with and the SDK field helpers

Every flow page in the app opens the same way — `strata_form_with`, bound to the flow's update path:

```erb
<%# app/views/leave_applications/edit_addresses.html.erb %>
<%= strata_form_with model: @leave_application, url: @flow_task.update_path, method: :patch do |f| %>
```

Inside a loop the model is the child record instead (`model: @flow_task.loop_record` — see
[flows](./flows.md)), and the staff determination drawer binds it to a plain ActiveModel form object
(`model: determination_form`), which works because that class overrides `model_name`.

## Composite field helpers

The interesting helpers are the ones that render a whole typed attribute — the field group matches
the `strata_attribute` type one-for-one:

```erb
<%# :name -> one helper for four inputs %>
<%= f.name :applicant_name, {
  legend: t(".applicant_name_title"),
  hint: t(".applicant_name_hint"),
  large_legend: true
} %>
```

```erb
<%# :address -> one helper for five inputs %>
<%= f.address_fields :residential_address, {
  legend: t(".residential_address_title"),
  hint: t(".residential_address_hint"),
  large_legend: true
} %>
```

```erb
<%# :memorable_date -> three month/day/year inputs %>
<h2 id="date-of-birth-heading" class="usa-form-heading"><%= t(".date_of_birth_title") %></h2>
<%= f.memorable_date :date_of_birth, aria: { labelledby: "date_of_birth_heading" } %>
```

```erb
<%# :tax_id -> masked single input %>
<%= f.tax_id_field :tax_identifier, aria: { labelledby: "tax-identifier-heading" } %>
```

```erb
<%# :us_date -> USWDS date picker %>
<%= f.date_picker :plan_effective_date %>
```

```erb
<%# :money -> currency input %>
<%= f.money_field :payment_amount, label: t(".payment_amount_legend"), width: "md" %>
```

The mapping is the practical takeaway:

| Attribute type | Helper | Example |
|---|---|---|
| `:name` | `f.name` | `edit_name.html.erb` |
| `:address` | `f.address_fields` | `edit_addresses.html.erb` |
| `:memorable_date` | `f.memorable_date` | `edit_date_of_birth.html.erb` |
| `:us_date` | `f.date_picker` | `edit_commercial_plan_details.html.erb`, `staff/payments/new.html.erb` |
| `:tax_id` | `f.tax_id_field` | `edit_tax_identifier.html.erb`, `edit_employer_details.html.erb` |
| `:money` | `f.money_field` | `edit_amount_and_method.html.erb` |
| `:year_quarter` | `f.select` over `reporting_period_options` | `edit_period_and_method.html.erb` |

Note the last row — the view says why in a comment:

```erb
<%# :year_quarter has no form-builder helper in the SDK, so the
    period is a plain select over "YYYYQQ" values, which YearQuarterType parses. %>
<%= f.select :reporting_period,
             QuarterlyWageReportForm.reporting_period_options,
             {
               label: t(".reporting_period_legend"),
               optional: true,
               hint: t(".reporting_period_hint"),
               include_blank: t(".reporting_period_placeholder")
             } %>
```

so the app supplies its own option pairs.

One caveat on `f.money_field`: it posts a String the SDK's money type casts to `nil`, which is why
both money-entry models include the `MoneyInput` concern — see
[value objects](./value-objects.md).

## Booleans and progressive disclosure

`yes_no` renders a boolean as a radio pair, with per-option overrides:

```erb
<%= f.yes_no :accepts_mail,
  legend: t(".accepts_mail_title"),
  hint: t(".accepts_mail_hint"),
  yes_options: { label: t("us_form_with.boolean_true") },
  no_options: { label: t(".accepts_mail_no") }
%>
```

`conditional` reveals dependent fields client-side, keyed on another field's value:

```erb
<%= f.conditional(:accepts_mail, eq: "false") do %>
  <%= f.address_fields :mailing_address, legend: t(".mailing_address_title"), large_legend: true %>
<% end %>
```

The values compared are **strings** (`eq: "false"`, `eq: "direct_deposit"`, `eq: "different_amount"`,
`eq: "other"`, `eq: "approved"`), and the determination drawer adds `clear: true` so switching the
outcome discards the reasons chosen for the other branch:

```erb
<%# app/views/leave_application_cases/_determination_drawer_form.html.erb %>
<%= f.conditional(:outcome, eq: "approved", clear: true) do %>
  <%= f.fieldset t(".reason_label"), hint: t(".reason_hint"), attribute: :reasons,
        group_options: { class: "margin-bottom-3" } do %>
    <%= f.check_box :reasons, { multiple: true, label: t("...reasons.eligible") }, "eligible", nil %>
```

Thirteen `f.conditional` calls appear across the applicant, employer-review, and staff views, making it
the app's standard answer to conditional questions — the flow's `if:` handles *page*-level
branching, `f.conditional` handles *within-page* reveal.

## Fieldsets, radios and checkboxes

`fieldset` takes the legend plus an `attribute:` so errors attach to the right field, and
`group_options:` for the wrapper:

```erb
<%= f.hidden_field :payment_preference_type, value: "" %>
<%= f.fieldset t(".payment_preference_title"), { large_legend: true, attribute: :payment_preference_type } do %>
  <%= f.radio_button :payment_preference_type, :direct_deposit,
      label: t(".payment_preference_options.direct_deposit"),
      hint: t(".payment_preference_options.direct_deposit_hint") %>
  <%= f.radio_button :payment_preference_type, :prepaid_debit, ... %>
<% end %>
```

The `hidden_field ... value: ""` before the radio group is a deliberate HTML-spec workaround, called
out in a comment in the view.

Multi-select checkboxes use the Rails four-argument form with `multiple: true`
(`f.check_box :reasons, { multiple: true, label: ... }, "eligible", nil`), which is how an array
attribute like `reasons` collects several values.

## Nested records in a form

`fields_for` works as in plain Rails, and the child fields keep the SDK builder's label/hint
behavior:

```erb
<%= f.conditional(:payment_preference_type, eq: "direct_deposit") do %>
  <%= f.fields_for :bank_account do |bank_account| %>
    <%= bank_account.text_field :routing_number, inputmode: "numeric", hint: t(".routing_number_hint") %>
    <%= bank_account.text_field :routing_number_confirmation, inputmode: "numeric",
          hint: t(".routing_number_confirmation_hint"), onpaste: "return false;" %>
    <%= bank_account.fieldset t(".account_type_title"), attribute: :account_type do %>
      <% BankAccount.account_types.each do |value, _| %>
        <%= bank_account.radio_button :account_type, value, label: t(".account_type_options.#{value}") %>
      <% end %>
    <% end %>
  <% end %>
<% end %>
```

## Error summaries built from the builder itself

This is the app's most unusual use of the form builder: it instantiates `Strata::FormBuilder`
**outside a form** to compute the anchor ids an error summary needs to link to.

```ruby
# app/presenters/model_error_presenter.rb
def initialize(model, error, builder = Strata::FormBuilder)
  @model = model
  @error = error
  @formatted_errors = []
  @form_builder = builder.new(model.model_name.param_key, model, self, builder:)
end
```

With a builder in hand, `form_group_id` gives the id of the field's wrapper, and `fields_for` walks
nested errors to the right child field:

```ruby
def format_nested_error
  association, attribute = error.attribute.to_s.split(".")

  form_builder.fields_for association, model.public_send(association) do |fields|
    if fields.object.errors.any? { |e| e.attribute == error.inner_error.attribute }
      formatted_errors << link(fields.form_group_id(attribute))
    end
  end
end

def format_base_error
  formatted_errors << link(form_builder.form_group_id(error.attribute)) if error.present?
end

def link(id)
  link_to(summary_error_message, "##{id}")
end
```

Every flow-backed record in the app mixes in the `PresentsErrors` concern that drives it:

```ruby
# app/presenters/presents_errors.rb
def formatted_errors(error_ordering = nil)
  # ...
  @formatted_errors ||=
    ordered_errors.map { |error| ModelErrorPresenter.new(self, error).error_links }.flatten
end
```

...and every flow controller's `on_flow_update_invalid` hook puts the result in the flash:

```ruby
def on_flow_update_invalid(record)
  flash.now[:errors] = record.formatted_errors
end
```

So the loop is: SDK flow rejects a page → hook fires → `formatted_errors` re-derives the field ids
through `Strata::FormBuilder` → the flash renders a USWDS error summary of in-page anchor links.

Error messages themselves are looked up under a conventional i18n key, with an optional
summary-specific variant:

```ruby
"activerecord.errors.models.#{error.base.model_name.i18n_key}.attributes.#{error.attribute}.#{error.type}#{suffix}"
```

where `suffix` is `"_summary"` for the summary link text and empty for the inline message.

One exception: `Staff::DeterminationForm` (`app/models/staff/determination_form.rb`) does **not**
mix in `PresentsErrors`. The determination drawer renders that form's `errors[:base]` directly in a
USWDS alert, rather than through presenter-built anchor links:

```erb
<%# app/views/leave_application_cases/_determination_drawer_form.html.erb %>
<% if determination_form.errors[:base].any? %>
  <div class="usa-alert usa-alert--error margin-bottom-3" role="alert">
    ...
```

## Two form builders, side by side

The app runs the SDK builder **and** a pre-existing app-local one. `us_form_with` is a plain helper
that swaps in the app's `UswdsFormBuilder`:

```ruby
# app/helpers/application_helper.rb
def us_form_with(model: nil, scope: nil, url: nil, format: nil, **options, &block)
  options[:builder] = UswdsFormBuilder
  form_with model: model, scope: scope, url: url, format: format, **options, &block
end
```

`UswdsFormBuilder` (`app/helpers/uswds_form_builder.rb`) is an `ActionView::Helpers::FormBuilder`
subclass with its own `tax_id_field`, `date_picker`, `yes_no`, `fieldset`, `field_error`, `hint`,
`form_group`, and `human_name` — a parallel implementation of much of the SDK builder's surface.

The split in practice:

| Builder | Used by |
|---|---|
| `strata_form_with` (SDK) | Every flow page (applicant, employer, and change-request flows), the employer review, information requests, and the staff views — determination drawer, payment form, and employer CRUD form |
| `us_form_with` (app) | The Devise/Cognito auth pages under `app/views/users/**` and the `/dev/sandbox` test page |

The two share i18n keys (`us_form_with.boolean_true`, `us_form_with.boolean_false`) — the SDK-built
`yes_no` calls in the flow views translate those app keys explicitly for their labels.

**Documentation drift to be aware of:** `docs/paidleave/forms.md` documents only `us_form_with`
("A custom `us_form_with` helper is provided to create forms"), including its `fieldset`, `hint`,
`yes_no`, `field_error`, `human_name` and `width:` conventions. It does not mention
`strata_form_with`, even though that is what every flow page in the app actually uses. Read that doc
as covering the auth pages, and this one as covering the flows.
