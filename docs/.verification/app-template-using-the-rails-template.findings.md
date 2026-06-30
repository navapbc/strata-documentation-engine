# Verification findings: app-template-using-the-rails-template

Doc: `docs/sources/app-template/using-the-rails-template.md`
Source: `.sources/app-template`
Round: 1

## Summary

No unsupported, inaccurate, or outdated claims found. All statements in the doc are
directly supported by the source files listed in `source_ref.paths`.

## Spot-checks performed (all supported)

- Install/update commands and `<APP_NAME>` flow — `README.md` lines 57-77.
- Copier questions `app_name` (regex `^[a-z0-9\-_]+$`) and `app_local_port` (default
  `3000`) — `copier.yml` lines 4-15.
- `_subdirectory: template` — `copier.yml` line 29.
- Copier answers file under `.template-application-rails/` named via
  `_copier_conf.answers_file` — `copier.yml` lines 21-27 (confirmed `_answers_file`
  commented out); answers template at
  `template/.template-application-rails/{{_copier_conf.answers_file}}.jinja`.
- Scaffolded layout (`<APP_NAME>/`, `docs/<APP_NAME>/`,
  `.github/workflows/ci-<APP_NAME>.yml`) — `README.md` "Repo structure" +
  `template/.github/workflows/ci-{{app_name}}.yml.jinja`.
- Feature list (USWDS + custom `us_form_with` form builder, RDS Postgres w/ UUIDs,
  Active Storage on S3, Action Mailer on SES, Azure Postgres via Entra ID, Devise +
  Cognito auth, Pundit authorization, i18n, RuboCop, RSpec) — `README.md` lines 30-40,
  `template/{{app_name}}/README.md.jinja` lines 5-17.
- Extension points `app/adapters/`, `app/forms/`, `app/services/` and reference to
  generated `docs/<APP_NAME>/software-architecture.md` —
  `template/{{app_name}}/README.md.jinja` lines 19-47.
- Env var `AUTH_ADAPTER` (default `"mock"`, switch to `"cognito"` + `COGNITO_USER_POOL_ID`,
  `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`) — `local.env.example.jinja` lines 33-38,
  `README.md.jinja` lines 102-109.
- Env var `DB_AUTH_METHOD` (unset uses `DB_PASSWORD`; `aws_iam`; `azure_entra` +
  `AZURE_DB_RESOURCE_URI`) — `local.env.example.jinja` lines 44-58,
  `config/initializers/database_auth.rb` lines 65-84.
- `ENABLE_LOOKBOOK` default `true` in local dev — `local.env.example.jinja` line 64.
- `make .env` from `local.env.example` — `Makefile.jinja` lines 80-81.
- Makefile command surface (`init-container`/`init-native`, `start-container`/
  `start-native`, `db-migrate`/`db-seed`/`db-reset`, `test`, `lint`,
  `rails-generate GENERATE_COMMAND="..."`, `CONTAINER_CMD` default `docker`) —
  `Makefile.jinja` lines 30-198.
- `--primary-key-type=uuid` guidance for `rails-generate` — UUID primary keys confirmed
  via `config/application.rb` line 53.
- Deploy config keys (`enable_identity_provider`, `enable_https`, `SECRET_KEY_BASE`,
  `DB_AUTH_METHOD`) in `infra/<APP_NAME>/app-config/` Terraform, same-`<APP_NAME>`
  infra-app install requirement — `template-only-docs/Deployment.md` lines 14-45.

## Findings

None.
