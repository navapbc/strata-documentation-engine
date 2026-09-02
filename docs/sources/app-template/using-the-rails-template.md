---
id: app-template-using-the-rails-template
title: Using the Rails application template
source: app-template
verified: ok
doc_type: guide
tags: [rails, template, copier, nava-platform, scaffold]
related: [app-template-setting-up-a-new-rails-project]
component_keys: [template-application-rails]
integrates_with: [template-infra, template-infra-azure]
summary: How to install, configure, and update the Nava Rails application template into a project using the nava-platform CLI.
source_ref:
  repo: https://github.com/navapbc/template-application-rails
  ref: 6cc244340dff39d0cdb333ea5e10abf6cfcd7722
  paths:
    - README.md
    - copier.yml
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/config/initializers/database_auth.rb
    - template-only-docs/Deployment.md
last_documented: 2026-07-21
---

# Using the Rails application template

`template-application-rails` is a [Copier](https://copier.readthedocs.io/) template that scaffolds
a production-ready Ruby on Rails application into an existing project. You install and update it with
the [`nava-platform` CLI](https://github.com/navapbc/platform-cli) rather than cloning it directly,
and a project may host more than one application (each installation is keyed by an app name).

## Prerequisites

- The [`nava-platform` CLI installed](https://github.com/navapbc/platform-cli).
- A target project directory (typically a git repository) to install the application into.
- A container runtime such as [Docker](https://www.docker.com/) or
  [Finch](https://github.com/runfinch/finch) to run the generated app locally. By default the
  generated `Makefile` uses `docker`; set `CONTAINER_CMD=finch` to override
  (`template/{{app_name}}/Makefile.jinja`).
- For deployed environments using the default configuration: an AWS account with a Cognito User
  Pool and App Client (the template configures authentication via AWS Cognito by default), or an
  Azure subscription as an alternative.

## Installing the template

From the root of your project, install the template, choosing an `<APP_NAME>` for the application
(`README.md`):

```sh
nava-platform app install --template-uri https://github.com/navapbc/template-application-rails . <APP_NAME>
```

The template asks for two questions, defined in `copier.yml`:

- `app_name` — the name of the app. Must match `^[a-z0-9\-_]+$` (lowercase letters, digits, dashes,
  and underscores only).
- `app_local_port` — the port used for local development (default `3000`).

The template's `_subdirectory` is `template`, so everything under `template/` is rendered into your
project. The Copier answers are recorded in an answers file under `.template-application-rails/`
(named via Copier's `_copier_conf.answers_file`) so the installation can be updated later
(`template/.template-application-rails/{{_copier_conf.answers_file}}.jinja`).

## What the template scaffolds

The template renders an `<APP_NAME>/` application directory plus a `docs/<APP_NAME>/` documentation
directory and a `.github/workflows/ci-<APP_NAME>.yml` CI workflow (`template/` layout). The Rails
app it scaffolds includes (`README.md`, `template/{{app_name}}/README.md.jinja`):

- The [U.S. Web Design System (USWDS)](https://designsystem.digital.gov/) for styling and common
  components, with a custom USWDS form builder (`us_form_with`).
- AWS integrations: PostgreSQL on RDS with UUID primary keys, Active Storage on S3, and Action
  Mailer via SES.
- Azure integration: PostgreSQL using Microsoft Entra ID.
- Authentication via [Devise](https://github.com/heartcombo/devise) and AWS Cognito, with
  authorization via [Pundit](https://github.com/varvet/pundit).
- Internationalization (i18n) using Rails' built-in support.
- Linting with [RuboCop](https://rubocop.org/) and testing with [RSpec](https://rspec.info/).

The application code follows MVC plus a few conventional extension points —
`app/adapters/` (external-service wrappers), `app/forms/` (form objects), and
`app/services/` (cross-model business logic) — documented in the generated
`docs/<APP_NAME>/software-architecture.md`.

## Configuring the generated app

Local configuration lives in the generated app's `.env`, created by `make .env` from
`local.env.example` (`template/{{app_name}}/local.env.example.jinja`). Notable variables:

- `AUTH_ADAPTER` — `mock` (default) lets you log in locally with any email/password; set to
  `cognito` to drive the real Cognito flow (which also requires `COGNITO_USER_POOL_ID`,
  `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`).
- `DB_AUTH_METHOD` — unset uses `DB_PASSWORD` directly (local); `aws_iam` uses RDS IAM auth tokens;
  `azure_entra` uses an Entra ID token (also set `AZURE_DB_RESOURCE_URI`).
- `ENABLE_LOOKBOOK` — mounts the Lookbook component explorer at `/lookbook` when set; the example
  env enables it (`true`) for local development.

The generated `Makefile` (`template/{{app_name}}/Makefile.jinja`) is the command surface: `make
init-container` / `make init-native` to bootstrap, `make start-container` / `make start-native` to
run, `make db-migrate` / `make db-seed` / `make db-reset` for the database, `make test` and `make
lint` for CI tasks, and `make rails-generate GENERATE_COMMAND="..."` to run Rails generators
(remember `--primary-key-type=uuid` because the app uses UUID primary keys).

## Deploying

The template is designed to deploy on a Nava Platform infrastructure template — either the AWS
template (`template-infra`) or the Azure template (`template-infra-azure`); see
`template-only-docs/Deployment.md`. Install the matching infra-app template with the
**same `<APP_NAME>`** using the `nava-platform` CLI, then set the application's configuration (e.g.
`enable_identity_provider`, `enable_https`, `SECRET_KEY_BASE`, and `DB_AUTH_METHOD`) in the generated
`infra/<APP_NAME>/app-config/` Terraform. `DB_AUTH_METHOD=aws_iam` selects RDS IAM auth on AWS;
`DB_AUTH_METHOD=azure_entra` (plus `AZURE_DB_RESOURCE_URI`) selects Microsoft Entra ID auth on Azure
(`template/{{app_name}}/config/initializers/database_auth.rb`).

## Updating the template

To pull a newer version of the template into an already-installed project, run from the project root
(`README.md`):

```sh
nava-platform app update . <APP_NAME>
```

This re-renders the template using the recorded answers file, applying upstream changes while
preserving your `app_name` and `app_local_port`.
