---
id: example-strata-unemployment-components
title: SDK ViewComponents and shared templates
source: strata-unemployment
doc_type: example
tags: [example-app, components, viewcomponent, templates]
related:
  - example-strata-unemployment-overview
  - example-strata-unemployment-flow
  - example-strata-unemployment-form-builder
demonstrates: [components]
summary: How the unemployment portal renders SDK-provided UI — the TaskListComponent and the strata/application_forms index and show templates.
source_ref:
  repo: https://github.com/navapbc/strata-unemployment
  ref: 480303cf99722ff87c97e325e34316300b1bbd26
  paths:
    - unemployment/app/views/unemployment_benefits_application_forms/show.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/index.html.erb
    - unemployment/app/views/unemployment_benefits_application_forms/_row.html.erb
verified: ok
last_documented: 2026-06-29
---

# SDK ViewComponents and shared templates

Beyond the form-builder field helpers, the portal renders three pieces of SDK-provided UI: a task
list ViewComponent and two shared application-form page templates.

## TaskListComponent

The in-progress application page renders the SDK's task-list ViewComponent, passing the flow and a
flag to show step labels:

```erb
<%# app/views/unemployment_benefits_application_forms/show.html.erb %>
<% else %>
  <% content_for :title, t(".in_progress_title") %>
  <h1><%= t(".in_progress_title") %></h1>
  <p><%= t(".in_progress_description") %></p>
  <%= render Strata::Flows::TaskListComponent.new(flow: @flow, show_step_label: true) %>
<% end %>
```

`Strata::Flows::TaskListComponent` takes the flow (`@flow`, supplied by the flow controller) and
renders the task/page progress list, so the app does not hand-build the navigation.

## Shared `strata/application_forms` templates

Two pages defer their entire layout to SDK templates via `render template:`, supplying only locals:

- **Index** — `render template: "strata/application_forms/index"` with `title`, `intro`,
  `new_button_text`, `new_path`, `in_progress_applications_heading`, an `application_forms` array (each `created_at`,
  `path`, `status`), and a `row_view` pointing back at the app's `_row` partial:

```erb
<%# app/views/unemployment_benefits_application_forms/index.html.erb %>
<%= render template: "strata/application_forms/index", locals: {
  title: t(".title"),
  intro: t(".intro"),
  new_button_text: t(".new_button"),
  new_path: new_unemployment_benefits_application_form_path,
  in_progress_applications_heading: t(".in_progress_applications.heading"),
  application_forms: @unemployment_benefits_application_forms.map { |form| {
    created_at: form.created_at.strftime("%B %d, %Y at %I:%M %p %Z"),
    path: unemployment_benefits_application_form_path(form),
    status: form.status
  }},
  row_view: "unemployment_benefits_application_forms/row"
} %>
```

  The `row_view` local lets the app customize each table row (the app's `_row.html.erb` renders the
  created-at link, the localized status via `t("strata.application_forms.statuses.#{...}")`, and a
  fixed "Unemployment Benefits Application" label).

- **Show (submitted)** — when the application is submitted, `show.html.erb` renders
  `template: "strata/application_forms/show"` with locals for title, back link, index path,
  formatted `created_at`/`submitted_at`, `current_status`, a `next_step` string, and a
  `submitted_on_text` label (`t(".submitted_on")`). When not yet
  submitted, it falls back to rendering the `TaskListComponent` shown above.

These templates and the localized `strata.application_forms.statuses.*` keys are provided by the
SDK engine (mounted at `/` via `mount Strata::Engine => "/"`); the app supplies data and copy.
