---
id: app-template-setting-up-a-new-rails-project
title: Setting up a new Rails project
source: app-template
verified: ok
doc_type: example
tags: [rails, walkthrough, bootstrap, local-development, getting-started]
related: [app-template-using-the-rails-template]
component_keys: [template-application-rails]
integrates_with: [template-infra]
summary: End-to-end walkthrough of installing the Rails application template and running the generated app locally.
source_ref:
  repo: https://github.com/navapbc/template-application-rails
  ref: 6cc244340dff39d0cdb333ea5e10abf6cfcd7722
  paths:
    - README.md
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/config/routes.rb
    - template/{{app_name}}/Dockerfile
    - template/docs/{{app_name}}/technical-foundation.md
    - template/.github/workflows/ci-{{app_name}}.yml.jinja
last_documented: 2026-07-21
---

# Setting up a new Rails project

This walkthrough creates a brand-new Rails application called `myapp` from the
`template-application-rails` template and runs it locally in a container. Substitute your own app
name for `myapp` throughout. Every command below is taken from the template's `README.md` and the
generated app's `Makefile`/`README.md`.

## 1. Install the template

This requires the `nava-platform` CLI (platform-cli) to be installed first
(`README.md`, "Install the nava-platform tool").

From the root of the project that will host the app (`README.md`):

```sh
nava-platform app install --template-uri https://github.com/navapbc/template-application-rails . myapp
```

When prompted (`copier.yml`):

- `app_name`: `myapp`
- `app_local_port`: `3000` (accept the default unless `3000` is taken)

## 2. Resulting structure

The template renders three things into your project (`template/` layout): the application directory,
its docs, and a CI workflow.

```text
.
├── myapp/                         # the Rails application
│   ├── app/
│   │   ├── adapters/              # external-service wrappers (e.g. auth/cognito_adapter.rb)
│   │   ├── controllers/
│   │   ├── forms/                 # form objects
│   │   ├── mailers/
│   │   ├── models/
│   │   ├── services/              # cross-model business logic
│   │   └── views/
│   ├── config/
│   │   ├── locales/               # i18n strings
│   │   └── routes.rb
│   ├── db/                        # migrate/, seeds/, schema.rb, seeds.rb
│   ├── spec/                      # RSpec tests
│   ├── Makefile                   # the command surface
│   ├── Dockerfile                 # multi-stage: base → build → (dev | release-build); base → release (copies from release-build)
│   └── local.env.example          # template for the .env file
├── docs/myapp/                    # technical-foundation.md, software-architecture.md, auth.md, ...
└── .github/workflows/ci-myapp.yml # lint + test on pushes/PRs touching myapp/**
```

Directory roles are described in `docs/myapp/software-architecture.md` and
`docs/myapp/technical-foundation.md`.

## 3. Create the local environment file

Change into the app directory and generate `.env` from the checked-in example
(`template/{{app_name}}/Makefile.jinja`, `template/{{app_name}}/local.env.example.jinja`):

```sh
cd myapp
make .env
```

Edit any variable marked `<FILL ME IN>`. For a first local run you can leave the defaults: the
example sets `AUTH_ADAPTER="mock"` (log in with any email/password) and a local database
(`DB_HOST=127.0.0.1`, `DB_NAME=app`, `DB_USER=app`, `DB_PASSWORD=secret123`) with `DB_AUTH_METHOD`
unset.

## 4. Initialize and run in a container

Bootstrap the project — this builds the image, brings up the database, runs migrations, prepares the
test database, and seeds data (`make init-container` chains `.env build init-db`, and `init-db`
chains `db-up wait-on-db db-migrate db-test-prepare db-seed`):

```sh
make init-container
```

Then start the app and visit it in your browser at `http://localhost:3000`
(`template/{{app_name}}/README.md.jinja`):

```sh
make start-container
```

To run natively instead of in a container, use `make init-native` then `make start-native` (requires
the Ruby version in `.ruby-version` and Node LTS).

## 5. Verify it works

- The root path `/` renders the home page; auth flows live under `/users/...` and a health check is
  at `/up` (`template/{{app_name}}/config/routes.rb`).
- With `AUTH_ADAPTER=mock`, log in with any email and password (avoid reserved keywords such as
  `unconfirmed`/`mfa` in the email or `wrong` as the password, which trigger specific error
  scenarios — see `docs/myapp/auth.md`).
- A live form sandbox is served at `/dev/sandbox` for exercising the USWDS form helpers
  (`docs/myapp/forms.md`, the `dev` namespace in `config/routes.rb`).

## 6. Run the checks

The generated CI workflow runs lint and tests (`template/.github/workflows/ci-{{app_name}}.yml.jinja`);
its lint step invokes `make lint-ci`, which runs RuboCop without auto-fixing. Run the tests and lint
locally (`template/{{app_name}}/Makefile.jinja`):

```sh
make lint        # RuboCop with auto-fix (local convenience)
make lint-ci     # RuboCop without auto-fix (matches CI)
make test        # RSpec; pass args="spec/path/to/file_spec.rb" to scope
```

## 7. Generate new code

Use Rails generators through the Makefile, passing `--primary-key-type=uuid` because the app uses
UUID primary keys (`docs/myapp/technical-foundation.md`):

```sh
make rails-generate GENERATE_COMMAND="scaffold Foo --primary-key-type=uuid"
make locale MODEL=Foo                 # i18n locale files for a model
make new-authz-policy MODEL=Foo       # a Pundit policy + spec
```

At this point you have a running, tested Rails application. To deploy it, install the matching
infrastructure template (`template-infra`) with the same app name and follow
`template-only-docs/Deployment.md`.
